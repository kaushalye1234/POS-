require('dotenv').config();

const DEFAULT_DEV_MONGO_URI = 'mongodb://127.0.0.1:27017/fashion_shaa_pos';
const DEFAULT_PORT = 5000;
const DEFAULT_NODE_ENV = 'development';
const DEFAULT_JWT_SECRET = 'fashion_shaa_pos_jwt_secret_change_in_production';
const DEFAULT_JWT_EXPIRY = '12h';
const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Colombo';
const ALLOWED_MONGO_CONNECTION_MODES = new Set(['single', 'local', 'remote', 'auto']);
const DEFAULT_MONGO_SYNC_INTERVAL_MS = 60000;

function readEnv(...keys) {
    for (const key of keys) {
        const raw = process.env[key];
        if (typeof raw === 'string' && raw.trim()) {
            return raw.trim();
        }
    }
    return '';
}

function parsePort(rawPort) {
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return DEFAULT_PORT;
    }
    return parsed;
}

function parseCorsOrigins(rawOrigins) {
    return String(rawOrigins || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => {
            try {
                return new URL(origin).origin;
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

function parseBoolean(rawValue, defaultValue = false) {
    const normalized = String(rawValue || '').trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return defaultValue;
}

function parsePositiveInteger(rawValue, fallback) {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return fallback;
    }
    return parsed;
}

function parseMongoConnectionMode(rawMode) {
    const normalized = String(rawMode || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'online') return 'remote';
    return ALLOWED_MONGO_CONNECTION_MODES.has(normalized) ? normalized : '';
}

function normalizeMongoUri(rawUri) {
    const value = String(rawUri || '').trim();
    return value || '';
}

function isLikelyRemoteMongoUri(uri) {
    const value = String(uri || '').toLowerCase();
    if (!value) return false;
    return value.includes('mongodb.net') || value.startsWith('mongodb+srv://');
}

function pushMongoCandidate(candidates, source, uri) {
    const normalizedUri = normalizeMongoUri(uri);
    if (!normalizedUri) return;
    if (candidates.some((candidate) => candidate.uri === normalizedUri)) return;
    candidates.push({ source, uri: normalizedUri });
}

function buildMongoConfig() {
    const explicitUri = normalizeMongoUri(readEnv('MONGO_URI', 'MONGODB_URI'));
    const localUri = normalizeMongoUri(readEnv('MONGO_LOCAL_URI')) || DEFAULT_DEV_MONGO_URI;
    const remoteUri = normalizeMongoUri(readEnv('MONGO_REMOTE_URI'));
    const requestedMode = parseMongoConnectionMode(readEnv('MONGO_CONNECTION_MODE'));
    const mode = requestedMode || (remoteUri ? 'auto' : (explicitUri ? 'single' : 'local'));
    const candidates = [];

    if (mode === 'local') {
        pushMongoCandidate(candidates, 'local', localUri);
    } else if (mode === 'remote') {
        pushMongoCandidate(candidates, 'remote', remoteUri);
        if (!remoteUri && explicitUri && isLikelyRemoteMongoUri(explicitUri)) {
            pushMongoCandidate(candidates, 'legacy-remote', explicitUri);
        }
    } else if (mode === 'auto') {
        pushMongoCandidate(candidates, 'remote', remoteUri);
        if (explicitUri && isLikelyRemoteMongoUri(explicitUri)) {
            pushMongoCandidate(candidates, 'legacy-remote', explicitUri);
        }
        pushMongoCandidate(candidates, 'local', localUri);
    } else {
        pushMongoCandidate(candidates, 'explicit', explicitUri);
    }

    if (candidates.length === 0) {
        pushMongoCandidate(candidates, explicitUri ? 'explicit' : 'local', explicitUri || localUri || DEFAULT_DEV_MONGO_URI);
    }

    return {
        mongoUri: candidates[0]?.uri || '',
        mongoCandidates: candidates,
        mongoConnectionMode: mode,
        mongoExplicitUri: explicitUri,
        mongoLocalUri: localUri,
        mongoRemoteUri: remoteUri || (explicitUri && isLikelyRemoteMongoUri(explicitUri) ? explicitUri : ''),
        hasExplicitMongoUri: Boolean(explicitUri),
        hasLocalMongoUri: Boolean(localUri),
        hasRemoteMongoUri: Boolean(remoteUri)
    };
}

const mongoConfig = buildMongoConfig();

module.exports = {
    port: parsePort(readEnv('PORT') || DEFAULT_PORT),
    nodeEnv: readEnv('NODE_ENV') || DEFAULT_NODE_ENV,
    mongoUri: mongoConfig.mongoUri,
    mongoCandidates: mongoConfig.mongoCandidates,
    mongoConnectionMode: mongoConfig.mongoConnectionMode,
    mongoExplicitUri: mongoConfig.mongoExplicitUri,
    mongoLocalUri: mongoConfig.mongoLocalUri,
    mongoRemoteUri: mongoConfig.mongoRemoteUri,
    hasExplicitMongoUri: mongoConfig.hasExplicitMongoUri,
    hasLocalMongoUri: mongoConfig.hasLocalMongoUri,
    hasRemoteMongoUri: mongoConfig.hasRemoteMongoUri,
    mongoSyncEnabled: parseBoolean(readEnv('MONGO_SYNC_ENABLED'), false),
    mongoSyncOnStartup: parseBoolean(readEnv('MONGO_SYNC_ON_STARTUP'), true),
    mongoSyncIntervalMs: parsePositiveInteger(readEnv('MONGO_SYNC_INTERVAL_MS'), DEFAULT_MONGO_SYNC_INTERVAL_MS),
    businessTimeZone: readEnv('BUSINESS_TIME_ZONE') || DEFAULT_BUSINESS_TIME_ZONE,
    jwtSecret: readEnv('JWT_SECRET') || DEFAULT_JWT_SECRET,
    jwtExpiry: readEnv('JWT_EXPIRY', 'JWT_EXPIRES_IN') || DEFAULT_JWT_EXPIRY,
    corsOrigins: parseCorsOrigins(readEnv('CORS_ORIGIN'))
};
