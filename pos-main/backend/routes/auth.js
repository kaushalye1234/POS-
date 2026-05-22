const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken, authorize, generateToken } = require('../middleware/auth');

// ============================================
// POST /api/auth/login
// Authenticate user and return JWT token
// ============================================
router.post('/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        // Find user (case-insensitive username)
        const user = await User.findOne({
            username: { $regex: new RegExp(`^${username}$`, 'i') }
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: 'Account is deactivated. Contact admin.' });
        }

        // Verify password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user);

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                employeeId: user.employeeId
            }
        });
    } catch (err) {
        next(err);
    }
});

// ============================================
// POST /api/auth/register
// Create a new user (admin only, or first user is auto-admin)
// ============================================
router.post('/register', async (req, res, next) => {
    try {
        const { username, password, role, employeeId } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ error: 'Username must be 3-30 characters.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        // Check if any users exist (first user becomes admin automatically)
        const userCount = await User.countDocuments();
        const isFirstUser = userCount === 0;

        // If not the first user, require auth token with admin/manager role
        if (!isFirstUser) {
            // Inline auth check for this route
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

            if (!token) {
                return res.status(401).json({ error: 'Only admins can create new users. Login required.' });
            }

            let creatorRole = null;
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, require('../middleware/auth').JWT_SECRET);
                if (!['admin', 'manager'].includes(decoded.role)) {
                    return res.status(403).json({ error: 'Only admins/managers can create users.' });
                }
                creatorRole = decoded.role;
            } catch (err) {
                return res.status(401).json({ error: 'Invalid or expired token.' });
            }

            if (creatorRole === 'manager' && role && role !== 'cashier') {
                return res.status(403).json({ error: 'Managers can only create cashier accounts.' });
            }
        }

        // Check for duplicate username
        const existing = await User.findOne({
            username: { $regex: new RegExp(`^${username}$`, 'i') }
        });
        if (existing) {
            return res.status(409).json({ error: 'Username already taken.' });
        }

        // Create user
        const newUser = new User({
            username,
            password,
            role: isFirstUser ? 'admin' : (role || 'cashier'),
            employeeId: employeeId || null,
            pin: req.body.pin || null
        });

        await newUser.save();

        // Auto-login: return token for the new user
        const generatedToken = generateToken(newUser);

        res.status(201).json({
            message: isFirstUser
                ? 'Admin account created successfully! This is the first user.'
                : 'User created successfully.',
            token: generatedToken,
            user: newUser.toJSON()
        });
    } catch (err) {
        next(err);
    }
});

// ============================================
// GET /api/auth/me
// Get current user info from token
// ============================================
router.get('/me', authenticateToken, async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.json(user);
    } catch (err) {
        next(err);
    }
});

// ============================================
// POST /api/auth/override
// Check Admin PIN for override
// ============================================
router.post('/override', authenticateToken, async (req, res, next) => {
    try {
        const { pin } = req.body;

        if (!pin) {
            return res.status(400).json({ error: 'PIN is required for override.' });
        }

        // Find an admin user
        const adminUsers = await User.find({ role: 'admin', isActive: true });
        
        let validAdmin = false;
        for (const admin of adminUsers) {
            const isMatch = await admin.comparePin(pin);
            if (isMatch) {
                validAdmin = true;
                break;
            }
        }

        if (!validAdmin) {
            return res.status(401).json({ error: 'Invalid Admin PIN.' });
        }

        res.json({ success: true, message: 'Override authorized.' });
    } catch (err) {
        next(err);
    }
});

// ============================================
// GET /api/auth/users
// List all users (admin only)
// ============================================
router.get('/users', authenticateToken, authorize('admin'), async (req, res, next) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        next(err);
    }
});

// ============================================
// PUT /api/auth/users/:id
// Update user (admin only) — change role, activate/deactivate
// ============================================
router.put('/users/:id', authenticateToken, authorize('admin'), async (req, res, next) => {
    try {
        const { role, isActive, password, pin, employeeId } = req.body;
        const updateData = {};

        if (role) updateData.role = role;
        if (typeof isActive === 'boolean') updateData.isActive = isActive;
        if (Object.prototype.hasOwnProperty.call(req.body, 'employeeId')) {
            updateData.employeeId = employeeId ? String(employeeId).trim() : null;
        }

        const bcrypt = require('bcryptjs');

        // If password is being changed, hash it
        if (password && password.length >= 6) {
            const salt = await bcrypt.genSalt(12);
            updateData.password = await bcrypt.hash(password, salt);
        }

        // If pin is being changed, hash it
        if (pin && pin.length >= 4) {
            const salt = await bcrypt.genSalt(12);
            updateData.pin = await bcrypt.hash(pin, salt);
        }

        const updated = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        ).select('-password');

        if (!updated) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json(updated);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
