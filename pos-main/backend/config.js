require('dotenv').config();

const DEFAULT_DEV_MONGO_URI = 'mongodb://127.0.0.1:27017/fashion_shaa_pos';
const DEFAULT_PORT = 5000;
const DEFAULT_NODE_ENV = 'development';
const DEFAULT_JWT_SECRET = 'fashion_shaa_pos_jwt_secret_change_in_production';
const DEFAULT_JWT_EXPIRY = '12h';

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

const mongoUriFromEnv = readEnv('MONGO_URI', 'MONGODB_URI');

module.exports = {
    port: parsePort(readEnv('PORT') || DEFAULT_PORT),
    nodeEnv: readEnv('NODE_ENV') || DEFAULT_NODE_ENV,
    mongoUri: mongoUriFromEnv || DEFAULT_DEV_MONGO_URI,
    hasExplicitMongoUri: Boolean(mongoUriFromEnv),
    jwtSecret: readEnv('JWT_SECRET') || DEFAULT_JWT_SECRET,
    jwtExpiry: readEnv('JWT_EXPIRY', 'JWT_EXPIRES_IN') || DEFAULT_JWT_EXPIRY,
    corsOrigins: parseCorsOrigins(readEnv('CORS_ORIGIN'))
};
