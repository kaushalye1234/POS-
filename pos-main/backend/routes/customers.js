const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const { authenticateToken, authorize } = require('../middleware/auth');  // FIXED: Add auth

function normalizeCustomerPayload(body = {}, fallbackId = '') {
    const parsedPoints = Number(body.points ?? body.loyaltyPoints ?? 0);

    return {
        id: String(body.id || fallbackId || '').trim(),
        name: String(body.name || '').trim(),
        phone: String(body.phone || '').trim(),
        email: String(body.email || '').trim(),
        address: String(body.address || '').trim(),
        birthday: String(body.birthday || '').trim(),
        points: Number.isFinite(parsedPoints) ? parsedPoints : null,
        notes: String(body.notes || '').trim(),
        lastVisit: String(body.lastVisit || '').trim(),
        photoBase64: String(body.photoBase64 || body.photo || '').trim(),
        createdAt: body.createdAt
    };
}

// GET all (with pagination)
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            Customer.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Customer.countDocuments()
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
        const data = await Customer.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new
router.post('/', authenticateToken, async (req, res, next) => {
    try {
        const payload = normalizeCustomerPayload(req.body);

        // Basic validation
        if (!payload.id || !payload.name || !payload.phone) {
            return res.status(400).json({ error: 'Missing required fields: id, name, phone' });
        }
        if (payload.points == null) {
            return res.status(400).json({ error: 'Points must be a number' });
        }

        const newItem = new Customer(payload);
        const saved = await newItem.save();
        res.status(201).json(saved);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'ID already exists' });
        next(err);
    }
});

// PUT update
router.put('/:id', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const payload = normalizeCustomerPayload(req.body, req.params.id);
        const { id, ...updateData } = payload;

        const updated = await Customer.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Not found' });
        res.json(updated);
    } catch (err) { next(err); }
});

// DELETE
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res, next) => {
    try {
        const deleted = await Customer.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
