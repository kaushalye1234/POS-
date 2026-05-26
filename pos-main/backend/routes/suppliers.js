const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const { authenticateToken, authorize } = require('../middleware/auth');

function toPurchaseOrderId(rawId) {
    const normalized = String(rawId || '').trim();
    return normalized || Date.now().toString();
}

function toSupplierId(rawSupplierId) {
    const normalized = String(rawSupplierId || '').trim();
    return normalized || '';
}

function toCurrency(rawAmount) {
    if (rawAmount == null || rawAmount === '') return 0;
    const parsed = Number(rawAmount);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizePurchaseOrderItems(rawItems) {
    if (Array.isArray(rawItems)) {
        return rawItems
            .map((item) => {
                if (!item) return null;
                if (typeof item === 'string') {
                    return normalizePurchaseOrderItems(item)[0] || null;
                }

                const itemClass = String(item.itemClass || item.name || item.itemName || '').trim();
                if (!itemClass) return null;

                const quantity = Number(item.quantity);
                const costPrice = Number(item.costPrice);
                const total = Number(item.total);

                return {
                    itemClass,
                    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
                    costPrice: Number.isFinite(costPrice) ? costPrice : undefined,
                    total: Number.isFinite(total) ? total : 0
                };
            })
            .filter(Boolean);
    }

    const text = String(rawItems || '').trim();
    if (!text) return [];

    return text
        .split(',')
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
            const match = chunk.match(/^(\d+)\s*x?\s*(.+)$/i);
            if (match) {
                return {
                    itemClass: match[2].trim(),
                    quantity: Number(match[1]) || 1,
                    total: 0
                };
            }

            return {
                itemClass: chunk,
                quantity: 1,
                total: 0
            };
        });
}

function normalizePurchaseOrderPayload(body = {}, fallbackId = '') {
    const totalAmount = toCurrency(body.totalAmount ?? body.cost);
    const supplierId = toSupplierId(body.supplierId);
    const status = String(body.status || 'pending').trim().toLowerCase() || 'pending';

    return {
        id: toPurchaseOrderId(body.id || fallbackId),
        supplierId,
        orderDate: String(body.orderDate || body.date || '').trim(),
        expectedDate: String(body.expectedDate || body.deliveryDate || '').trim(),
        items: normalizePurchaseOrderItems(body.items),
        totalAmount,
        status,
        notes: String(body.notes || '').trim(),
        createdAt: body.createdAt
    };
}

// FIXED: Add authentication to all routes
// GET all suppliers (with pagination)
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            Supplier.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Supplier.countDocuments()
        ]);
        res.json({
            data,
            pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: skip + limit < total }
        });
    } catch (err) { next(err); }
});

// GET one supplier
router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
        const data = await Supplier.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new supplier - FIXED: Add auth and validation
router.post('/', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { id, name, contactPerson, phone, email, address } = req.body;
        const errors = [];

        if (!id || typeof id !== 'string') errors.push('id is required and must be a string');
        if (!name || typeof name !== 'string') errors.push('name is required and must be a string');
        if (contactPerson && typeof contactPerson !== 'string') errors.push('contactPerson must be a string');
        if (phone && typeof phone !== 'string') errors.push('phone must be a string');
        if (email && typeof email !== 'string') errors.push('email must be a string');
        if (address && typeof address !== 'string') errors.push('address must be a string');

        if (errors.length) return res.status(400).json({ errors });

        // FIXED: Validate only known fields
        const allowedFields = ['id', 'name', 'contactPerson', 'phone', 'email', 'address', 'notes'];
        for (const key in req.body) {
            if (!allowedFields.includes(key)) {
                return res.status(400).json({ error: `Unknown field: ${key}` });
            }
        }

        const newItem = new Supplier(req.body);
        const saved = await newItem.save();
        res.status(201).json(saved);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'ID already exists' });
        next(err);
    }
});

// PUT update supplier - FIXED: Add auth
router.put('/:id', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { id, ...updateData } = req.body;

        // FIXED: Validate unknown fields
        const allowedFields = ['name', 'contactPerson', 'phone', 'email', 'address', 'notes'];
        for (const key in updateData) {
            if (!allowedFields.includes(key)) {
                return res.status(400).json({ error: `Unknown field: ${key}` });
            }
        }

        const updated = await Supplier.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Not found' });
        res.json(updated);
    } catch (err) { next(err); }
});

// DELETE supplier - FIXED: Add admin-only auth
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res, next) => {
    try {
        const deleted = await Supplier.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

// GET all purchase orders - FIXED: Add auth and pagination
router.get('/po/all', authenticateToken, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            PurchaseOrder.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            PurchaseOrder.countDocuments()
        ]);
        res.json({
            data,
            pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: skip + limit < total }
        });
    } catch (err) { next(err); }
});

// POST new purchase order - FIXED: Add auth
router.post('/po/new', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const payload = normalizePurchaseOrderPayload(req.body);

        // Validation
        if (!payload.supplierId) {
            return res.status(400).json({ error: 'Missing required field: supplierId' });
        }
        if (payload.totalAmount == null) {
            return res.status(400).json({ error: 'Total amount must be a number' });
        }
        if (!['pending', 'ordered', 'received', 'cancelled'].includes(payload.status)) {
            return res.status(400).json({ error: 'Invalid purchase order status' });
        }

        const newItem = new PurchaseOrder(payload);
        const saved = await newItem.save();
        res.status(201).json(saved);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'PO ID already exists' });
        next(err);
    }
});

// PUT update purchase order - FIXED: Add auth
router.put('/po/:id', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const payload = normalizePurchaseOrderPayload(req.body, req.params.id);
        const { id, ...updateData } = payload;

        const updated = await PurchaseOrder.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Not found' });
        res.json(updated);
    } catch (err) { next(err); }
});

module.exports = router;
