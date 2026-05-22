const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');

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

// GET all suppliers
router.get('/', async (req, res, next) => {
    try {
        const data = await Supplier.find().sort({ createdAt: -1 });
        res.json(data);
    } catch (err) { next(err); }
});

// GET one supplier
router.get('/:id', async (req, res, next) => {
    try {
        const data = await Supplier.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new supplier
router.post('/', async (req, res, next) => {
    try {
        const { id, name, contactPerson, phone, email, address } = req.body;

        // Basic validation
        if (!id || !name) {
            return res.status(400).json({ error: 'Missing required fields: id, name' });
        }

        const newItem = new Supplier(req.body);
        const saved = await newItem.save();
        res.status(201).json(saved);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'ID already exists' });
        next(err);
    }
});

// PUT update supplier
router.put('/:id', async (req, res, next) => {
    try {
        // Prevent changing id
        const { id, ...updateData } = req.body;

        const updated = await Supplier.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Not found' });
        res.json(updated);
    } catch (err) { next(err); }
});

// DELETE supplier
router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await Supplier.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

// GET all purchase orders
router.get('/po/all', async (req, res, next) => {
    try {
        const data = await PurchaseOrder.find().sort({ createdAt: -1 });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new purchase order
router.post('/po/new', async (req, res, next) => {
    try {
        const payload = normalizePurchaseOrderPayload(req.body);

        // Basic validation
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

// PUT update purchase order
router.put('/po/:id', async (req, res, next) => {
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
