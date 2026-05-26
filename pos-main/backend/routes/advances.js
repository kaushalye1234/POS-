const express = require('express');
const router = express.Router();
const EmployeeAdvance = require('../models/EmployeeAdvance');
const { authenticateToken, authorize } = require('../middleware/auth');

// FIXED: Add authentication to all routes
// GET all (with pagination)
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            EmployeeAdvance.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            EmployeeAdvance.countDocuments()
        ]);
        res.json({
            data,
            pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: skip + limit < total }
        });
    } catch (err) { next(err); }
});

// GET one
router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
        const data = await EmployeeAdvance.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new - FIXED: Add auth and input validation
router.post('/', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { id, employeeId, amount, reason, date, type } = req.body;
        const errors = [];

        if (!id || typeof id !== 'string') errors.push('id is required and must be a string');
        if (!employeeId || typeof employeeId !== 'string') errors.push('employeeId is required and must be a string');
        if (typeof amount !== 'number' || amount <= 0) errors.push('amount must be a positive number');
        if (!type || typeof type !== 'string') errors.push('type is required and must be a string');
        if (type && !['cash', 'goods'].includes(String(type).toLowerCase())) {
            errors.push('type must be cash or goods');
        }
        if (reason && typeof reason !== 'string') errors.push('reason must be a string');
        if (date && typeof date !== 'string') errors.push('date must be a string');

        if (errors.length) return res.status(400).json({ errors });

        // FIXED: Validate only known fields
        const allowedFields = ['id', 'employeeId', 'amount', 'type', 'reason', 'date', 'notes', 'status'];
        for (const key in req.body) {
            if (!allowedFields.includes(key)) {
                return res.status(400).json({ error: `Unknown field: ${key}` });
            }
        }

        const payload = { ...req.body, type: String(type || '').toLowerCase() };
        const newItem = new EmployeeAdvance(payload);
        const saved = await newItem.save();
        res.status(201).json(saved);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'ID already exists' });
        next(err);
    }
});

// PUT update - FIXED: Add auth
router.put('/:id', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { id, ...updateData } = req.body;

        // FIXED: Validate unknown fields
        const allowedFields = ['employeeId', 'amount', 'type', 'reason', 'date', 'notes', 'status'];
        for (const key in updateData) {
            if (!allowedFields.includes(key)) {
                return res.status(400).json({ error: `Unknown field: ${key}` });
            }
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'type')) {
            const type = String(updateData.type || '').toLowerCase();
            if (!['cash', 'goods'].includes(type)) {
                return res.status(400).json({ error: 'type must be cash or goods' });
            }
            updateData.type = type;
        }

        const updated = await EmployeeAdvance.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Not found' });
        res.json(updated);
    } catch (err) { next(err); }
});

// DELETE - FIXED: Add admin-only auth
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res, next) => {
    try {
        const deleted = await EmployeeAdvance.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
