const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');

const { authenticateToken, authorize } = require('./middleware/auth');

const app = express();
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);
const READY_STATE_LABELS = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
};

// ============================================
// SEC-007 FIX: Restrict CORS to known origins
// ============================================
function isLoopbackOrigin(origin) {
    try {
        const { hostname } = new URL(origin);
        return LOOPBACK_HOSTS.has(hostname);
    } catch {
        return false;
    }
}

function isAllowedOrigin(origin) {
    if (!origin || origin === 'null') return true;
    if (origin.startsWith('file://') || origin.startsWith('app://')) return true;
    if (isLoopbackOrigin(origin)) return true;

    try {
        const normalizedOrigin = new URL(origin).origin;
        return config.corsOrigins.includes(normalizedOrigin);
    } catch {
        return false;
    }
}

app.use(cors({
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }
        callback(new Error('CORS: Origin not allowed'));
    },
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================
// Rate Limiting — protect against brute force
// ============================================
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                  // 20 login attempts per window
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 10,              // 10 AI requests per minute
    message: { error: 'AI rate limit exceeded. Please wait.' }
});

// ============================================
// Database Connection + Transaction Support Probe
// ============================================
let supportsTransactions = false;

function getDatabaseHealth() {
    const readyState = mongoose.connection.readyState;
    return {
        ready: readyState === 1,
        readyState,
        status: READY_STATE_LABELS[readyState] || 'unknown'
    };
}

async function probeTransactionSupport() {
    try {
        const admin = mongoose.connection.db.admin();
        const info = await admin.command({ hello: 1 }).catch(() => admin.command({ ismaster: 1 }));
        supportsTransactions = !!(info.setName || info.isreplicaset || info.msg === 'isdbgrid');
        console.log(`Transaction support: ${supportsTransactions ? 'YES (replica set/sharded)' : 'NO (standalone)'}`);
    } catch (err) {
        supportsTransactions = false;
        console.warn('Transaction probe failed, assuming no transaction support:', err.message);
    }
}

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB runtime error:', err.message);
});

// Export transaction support flag for use in routes
app.set('supportsTransactions', () => supportsTransactions);

// ============================================
// Public Routes (no auth required)
// ============================================
app.get('/api/health', (req, res) => {
    const database = getDatabaseHealth();
    const isReady = database.ready;

    res.status(isReady ? 200 : 503).json({
        status: isReady ? 'ok' : 'degraded',
        message: isReady
            ? 'Fashion Shaa POS API is running'
            : 'Fashion Shaa POS API is waiting for MongoDB',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        database,
        transactionSupport: supportsTransactions
    });
});

app.use('/api/auth', authLimiter, require('./routes/auth'));

// ============================================
// Protected Routes (JWT required)
// ============================================
app.use('/api/employees', authenticateToken, require('./routes/employees'));
app.use('/api/items', authenticateToken, require('./routes/items'));
app.use('/api/sales', authenticateToken, require('./routes/sales'));
app.use('/api/ai', authenticateToken, aiLimiter, require('./routes/ai'));
app.use('/api/restock', authenticateToken, require('./routes/restock'));
app.use('/api/customers', authenticateToken, require('./routes/customers'));
app.use('/api/returns', authenticateToken, require('./routes/returns'));
app.use('/api/shifts', authenticateToken, require('./routes/shifts'));
app.use('/api/attendance', authenticateToken, authorize('admin', 'manager'), require('./routes/attendance'));
app.use('/api/suppliers', authenticateToken, authorize('admin', 'manager'), require('./routes/suppliers'));
app.use('/api/discounts', authenticateToken, require('./routes/discounts'));
app.use('/api/advances', authenticateToken, require('./routes/advances'));
app.use('/api/barcode', authenticateToken, require('./routes/barcode'));
app.use('/api/mappings', authenticateToken, authorize('admin', 'manager'), require('./routes/mappings'));

// ============================================
// Global Error Handler (always returns JSON)
// ============================================
app.use((err, req, res, next) => {
    console.error('API Error:', err.stack || err.message);

    // Handle CORS errors
    if (err.message && err.message.includes('CORS')) {
        return res.status(403).json({ error: err.message });
    }

    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({ error: 'Validation failed', details: messages });
    }

    // Handle duplicate key errors
    if (err.code === 11000) {
        return res.status(409).json({ error: 'Duplicate entry', field: Object.keys(err.keyPattern || {}) });
    }

    res.status(err.status || 500).json({
        error: config.nodeEnv === 'production' ? 'Internal Server Error' : err.message,
        ...(config.nodeEnv !== 'production' && { stack: err.stack })
    });
});

async function startServer() {
    if (!config.mongoUri) {
        console.error('MongoDB configuration error: MONGO_URI or MONGODB_URI must be set.');
        process.exit(1);
        return;
    }

    if (config.nodeEnv === 'production' && !config.hasExplicitMongoUri) {
        console.error('MongoDB configuration error: MONGO_URI or MONGODB_URI must be set in production.');
        process.exit(1);
        return;
    }

    try {
        await mongoose.connect(config.mongoUri);
        console.log('MongoDB Connected successfully');
        await probeTransactionSupport();

        app.listen(config.port, () => {
            console.log(`Server running on port ${config.port}`);
            console.log(`Environment: ${config.nodeEnv}`);
        });
    } catch (err) {
        console.error('MongoDB startup error:', err.message);
        process.exit(1);
    }
}

startServer();
