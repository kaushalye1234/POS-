const express = require('express');
const router = express.Router();
const DiscountRule = require('../models/DiscountRule');
const { authenticateToken, authorize } = require('../middleware/auth');  // FIXED: Add auth

const ALLOWED_TYPES = new Set(['percentage', 'fixed', 'bogo']);
const ALLOWED_VALUE_TYPES = new Set(['fixed', 'range']);

function isNumber(x) {
    return typeof x === 'number' && Number.isFinite(x);
}

function validateRule(rule) {
    const errors = [];

    if (!rule.id) errors.push('Missing required field: id');
    if (!rule.name) errors.push('Missing required field: name');
    if (!rule.type) errors.push('Missing required field: type');

    if (rule.type && !ALLOWED_TYPES.has(rule.type)) {
        errors.push(`Invalid type. Allowed: ${Array.from(ALLOWED_TYPES).join(', ')}`);
    }

    const valueType = rule.valueType || 'fixed';
    if (valueType && !ALLOWED_VALUE_TYPES.has(valueType)) {
        errors.push(`Invalid valueType. Allowed: ${Array.from(ALLOWED_VALUE_TYPES).join(', ')}`);
    }

    if (rule.minPurchase !== undefined && !isNumber(rule.minPurchase)) {
        errors.push('minPurchase must be a number');
    }
    if (isNumber(rule.minPurchase) && rule.minPurchase < 0) {
        errors.push('minPurchase must be >= 0');
    }

    if (rule.type === 'bogo') {
        // no numeric value required
        return errors;
    }

    if (valueType === 'fixed') {
        if (!isNumber(rule.value)) errors.push('value must be a number');
        if (isNumber(rule.value)) {
            if (rule.value < 0) errors.push('value must be >= 0');
            if (rule.type === 'percentage' && rule.value > 100) errors.push('percentage value must be <= 100');
        }
    } else if (valueType === 'range') {
        if (!isNumber(rule.valueMin) || !isNumber(rule.valueMax)) errors.push('valueMin and valueMax must be numbers');
        if (isNumber(rule.valueMin) && rule.valueMin < 0) errors.push('valueMin must be >= 0');
        if (isNumber(rule.valueMax) && rule.valueMax < 0) errors.push('valueMax must be >= 0');
        if (isNumber(rule.valueMin) && isNumber(rule.valueMax) && rule.valueMin > rule.valueMax) errors.push('valueMin must be <= valueMax');
        if (rule.type === 'percentage' && isNumber(rule.valueMax) && rule.valueMax > 100) errors.push('percentage valueMax must be <= 100');
    }

    return errors;
}

// GET all (with pagination)
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            DiscountRule.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            DiscountRule.countDocuments()
        ]);

        res.json({
            data,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) { next(err); }
});

// GET one
router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
        const data = await DiscountRule.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new
router.post('/', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { id, name, type } = req.body;
        if (!id || !name || !type) {
            return res.status(400).json({ error: 'Missing required fields: id, name, type' });
        }

        const errors = validateRule(req.body);
        if (errors.length) return res.status(400).json({ error: errors.join('; ') });

        const newRule = new DiscountRule(req.body);
        const saved = await newRule.save();
        res.status(201).json(saved);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'ID already exists' });
        next(err);
    }
});

// PUT update
router.put('/:id', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        // Prevent changing id
        const { id, ...updateData } = req.body;

        const existing = await DiscountRule.findOne({ id: req.params.id });
        if (!existing) return res.status(404).json({ error: 'Not found' });

        const merged = { ...existing.toObject(), ...updateData, id: existing.id };
        const errors = validateRule(merged);
        if (errors.length) return res.status(400).json({ error: errors.join('; ') });

        const updated = await DiscountRule.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );

        res.json(updated);
    } catch (err) { next(err); }
});

// DELETE
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res, next) => {
    try {
        const deleted = await DiscountRule.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
