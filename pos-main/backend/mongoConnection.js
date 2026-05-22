const mongoose = require('mongoose');
const config = require('./config');

function redactMongoUri(uri) {
    return String(uri || '').replace(/\/\/([^@/]+)@/, '//***@');
}

async function disconnectIfNeeded(mongooseInstance) {
    if (mongooseInstance.connection.readyState !== 0) {
        await mongooseInstance.disconnect().catch(() => {});
    }
}

async function connectMongo(mongooseInstance = mongoose, options = {}) {
    const candidates = Array.isArray(config.mongoCandidates) && config.mongoCandidates.length
        ? config.mongoCandidates
        : [{ source: 'default', uri: config.mongoUri }];
    const attempts = [];

    for (const candidate of candidates) {
        try {
            await mongooseInstance.connect(candidate.uri, options);
            return {
                source: candidate.source,
                uri: candidate.uri,
                mode: config.mongoConnectionMode,
                fallbackUsed: attempts.length > 0,
                attempts
            };
        } catch (error) {
            attempts.push({
                source: candidate.source,
                uri: redactMongoUri(candidate.uri),
                message: error?.message || String(error)
            });
            await disconnectIfNeeded(mongooseInstance);
        }
    }

    const error = new Error(`Unable to connect to MongoDB using mode "${config.mongoConnectionMode}".`);
    error.attempts = attempts;
    throw error;
}

module.exports = {
    connectMongo,
    redactMongoUri
};
