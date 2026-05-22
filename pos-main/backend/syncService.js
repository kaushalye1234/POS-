const mongoose = require('mongoose');
const config = require('./config');
const { redactMongoUri } = require('./mongoConnection');

const models = [
    require('./models/User'),
    require('./models/Employee'),
    require('./models/Item'),
    require('./models/Sale'),
    require('./models/Customer'),
    require('./models/Return'),
    require('./models/Shift'),
    require('./models/Attendance'),
    require('./models/Supplier'),
    require('./models/PurchaseOrder'),
    require('./models/DiscountRule'),
    require('./models/EmployeeAdvance')
];

const AVAILABLE_COLLECTIONS = models.map((model) => ({
    modelName: model.modelName,
    collectionName: model.collection.name
}));

const AVAILABLE_COLLECTION_NAMES = new Set(AVAILABLE_COLLECTIONS.map((item) => item.collectionName));

const syncState = {
    activeSource: 'unknown',
    activeUri: '',
    running: false,
    timer: null,
    lastRun: null,
    lastError: null
};

function normalizeSourceName(source, uri = '') {
    if (source === 'local') return 'local';
    if (source === 'remote' || source === 'legacy-remote') return 'remote';
    if (source === 'explicit') {
        if (uri && uri === config.mongoLocalUri) return 'local';
        if (uri && uri === config.mongoRemoteUri) return 'remote';
        if (String(uri || '').includes('mongodb.net')) return 'remote';
    }
    return source || 'unknown';
}

function getSyncEndpoints(direction = 'active-to-standby') {
    const localUri = config.mongoLocalUri;
    const remoteUri = config.mongoRemoteUri;

    if (!localUri || !remoteUri) {
        throw new Error('Both local and remote MongoDB URIs must be configured for sync.');
    }

    const activeSource = normalizeSourceName(syncState.activeSource, syncState.activeUri);

    if (direction === 'local-to-remote') {
        return {
            source: { name: 'local', uri: localUri },
            target: { name: 'remote', uri: remoteUri }
        };
    }

    if (direction === 'remote-to-local') {
        return {
            source: { name: 'remote', uri: remoteUri },
            target: { name: 'local', uri: localUri }
        };
    }

    if (direction !== 'active-to-standby') {
        throw new Error(`Unsupported sync direction: ${direction}`);
    }

    if (activeSource === 'local') {
        return {
            source: { name: 'local', uri: localUri },
            target: { name: 'remote', uri: remoteUri }
        };
    }

    if (activeSource === 'remote') {
        return {
            source: { name: 'remote', uri: remoteUri },
            target: { name: 'local', uri: localUri }
        };
    }

    throw new Error('Active MongoDB source is not known yet.');
}

function getSyncStatus() {
    return {
        enabled: config.mongoSyncEnabled,
        onStartup: config.mongoSyncOnStartup,
        intervalMs: config.mongoSyncIntervalMs,
        running: syncState.running,
        activeSource: normalizeSourceName(syncState.activeSource, syncState.activeUri),
        lastRun: syncState.lastRun,
        lastError: syncState.lastError,
        availableCollections: AVAILABLE_COLLECTIONS,
        configuredTargets: {
            local: config.mongoLocalUri ? redactMongoUri(config.mongoLocalUri) : '',
            remote: config.mongoRemoteUri ? redactMongoUri(config.mongoRemoteUri) : ''
        }
    };
}

function setActiveSyncSource(source, uri = '') {
    syncState.activeSource = normalizeSourceName(source, uri);
    syncState.activeUri = uri || '';
}

async function openConnection(uri) {
    const connection = mongoose.createConnection(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 15000
    });
    await connection.asPromise();
    return connection;
}

async function closeConnection(connection) {
    if (!connection) return;
    await connection.close().catch(() => {});
}

async function flushBatch(targetCollection, docs, totals) {
    if (!docs.length) return;

    const operations = docs.map((doc) => ({
        replaceOne: {
            filter: { _id: doc._id },
            replacement: doc,
            upsert: true
        }
    }));

    const result = await targetCollection.bulkWrite(operations, { ordered: false });
    totals.upserted += result.upsertedCount || 0;
    totals.matched += result.matchedCount || 0;
    totals.modified += result.modifiedCount || 0;
    totals.processed += docs.length;
}

async function syncCollection(sourceDb, targetDb, collectionName) {
    const sourceCollection = sourceDb.collection(collectionName);
    const targetCollection = targetDb.collection(collectionName);
    const cursor = sourceCollection.find({});
    const batch = [];
    const totals = {
        collection: collectionName,
        processed: 0,
        matched: 0,
        modified: 0,
        upserted: 0
    };

    for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= 200) {
            await flushBatch(targetCollection, batch.splice(0, batch.length), totals);
        }
    }

    if (batch.length) {
        await flushBatch(targetCollection, batch.splice(0, batch.length), totals);
    }

    return totals;
}

async function runSync({ direction = 'active-to-standby', collections = null, reason = 'manual' } = {}) {
    if (syncState.running) {
        const error = new Error('A MongoDB sync is already running.');
        error.status = 409;
        throw error;
    }

    const selectedCollections = Array.isArray(collections) && collections.length
        ? collections.map((name) => String(name || '').trim()).filter(Boolean)
        : AVAILABLE_COLLECTIONS.map((item) => item.collectionName);

    const invalidCollections = selectedCollections.filter((name) => !AVAILABLE_COLLECTION_NAMES.has(name));
    if (invalidCollections.length) {
        const error = new Error(`Invalid collections: ${invalidCollections.join(', ')}`);
        error.status = 400;
        throw error;
    }

    const endpoints = getSyncEndpoints(direction);
    let sourceConnection = null;
    let targetConnection = null;
    syncState.running = true;

    const startedAt = new Date().toISOString();
    const runSummary = {
        reason,
        direction,
        startedAt,
        completedAt: null,
        source: endpoints.source.name,
        target: endpoints.target.name,
        collections: [],
        totals: {
            processed: 0,
            matched: 0,
            modified: 0,
            upserted: 0
        }
    };

    try {
        sourceConnection = await openConnection(endpoints.source.uri);
        targetConnection = await openConnection(endpoints.target.uri);

        for (const collectionName of selectedCollections) {
            const summary = await syncCollection(sourceConnection.db, targetConnection.db, collectionName);
            runSummary.collections.push(summary);
            runSummary.totals.processed += summary.processed;
            runSummary.totals.matched += summary.matched;
            runSummary.totals.modified += summary.modified;
            runSummary.totals.upserted += summary.upserted;
        }

        runSummary.completedAt = new Date().toISOString();
        syncState.lastRun = runSummary;
        syncState.lastError = null;
        return runSummary;
    } catch (error) {
        syncState.lastError = {
            at: new Date().toISOString(),
            message: error?.message || String(error),
            direction,
            reason
        };
        throw error;
    } finally {
        syncState.running = false;
        await closeConnection(sourceConnection);
        await closeConnection(targetConnection);
    }
}

function startBackgroundSync() {
    if (!config.mongoSyncEnabled) return null;
    if (!config.mongoLocalUri || !config.mongoRemoteUri) return null;
    if (syncState.timer) return syncState.timer;

    if (config.mongoSyncOnStartup) {
        runSync({ direction: 'active-to-standby', reason: 'startup' }).catch((error) => {
            console.error('MongoDB startup sync failed:', error.message);
        });
    }

    syncState.timer = setInterval(() => {
        runSync({ direction: 'active-to-standby', reason: 'interval' }).catch((error) => {
            console.error('MongoDB background sync failed:', error.message);
        });
    }, config.mongoSyncIntervalMs);

    return syncState.timer;
}

function stopBackgroundSync() {
    if (syncState.timer) {
        clearInterval(syncState.timer);
        syncState.timer = null;
    }
}

module.exports = {
    getSyncStatus,
    runSync,
    setActiveSyncSource,
    startBackgroundSync,
    stopBackgroundSync
};
