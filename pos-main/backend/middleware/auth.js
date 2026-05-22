const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret: JWT_SECRET, jwtExpiry: JWT_EXPIRY } = require('../config');

/**
 * Middleware: Verify JWT token from Authorization header.
 * Attaches `req.user` with { id, username, role, employeeId }.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired. Please login again.' });
        }
        return res.status(403).json({ error: 'Invalid token.' });
    }
}

/**
 * Middleware factory: Restrict access to specific roles.
 * Usage: authorize('admin', 'manager')
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Insufficient permissions.',
                required: roles,
                current: req.user.role
            });
        }
        next();
    };
}

/**
 * Generate a JWT token for a user.
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user._id,
            username: user.username,
            role: user.role,
            employeeId: user.employeeId
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

module.exports = { authenticateToken, authorize, generateToken, JWT_SECRET };
