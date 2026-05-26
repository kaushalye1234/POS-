const express = require('express');
const router = express.Router();
const Return = require('../models/Return');
const { authenticateToken, authorize } = require('../middleware/auth');  // FIXED: Add auth

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeReturnItem(rawItem = {}) {
    const name = String(rawItem.name || rawItem.itemName || rawItem.itemSku || '').trim();
    const price = toNumber(rawItem.price ?? rawItem.unitPrice);
    const quantity = toNumber(rawItem.quantity);
    const returnQty = toNumber(rawItem.returnQty ?? rawItem.returnQuantity ?? rawItem.quantity);
    let refundAmount = toNumber(rawItem.refundAmount);

    if (refundAmount == null && price != null && returnQty != null) {
        refundAmount = parseFloat((price * returnQty).toFixed(2));
    }

    return { name, price, quantity, returnQty, refundAmount };
}

function normalizeReturnItems(rawItems) {
    if (!Array.isArray(rawItems)) return null;
    return rawItems.map((item) => normalizeReturnItem(item));
}

function computeTotalRefund(items, explicitTotal) {
    const explicit = toNumber(explicitTotal);
    if (explicit != null) return explicit;
    if (!Array.isArray(items)) return null;

    let total = 0;
    for (const item of items) {
        if (item.refundAmount == null) return null;
        total += item.refundAmount;
    }
    return parseFloat(total.toFixed(2));
}

function normalizeReturnPayload(body = {}, fallbackId = '') {
    const errors = [];
    const id = String(body.id || fallbackId || '').trim();
    const receiptId = String(body.receiptId || body.saleId || '').trim();
    const originalSaleId = String(body.originalSaleId || body.saleId || '').trim();

    let items = normalizeReturnItems(body.items);
    if (!items && (body.itemSku || body.itemName || body.name)) {
        items = normalizeReturnItems([{
            name: body.itemName || body.name || body.itemSku,
            price: body.price ?? body.unitPrice,
            quantity: body.quantity,
            returnQty: body.returnQty ?? body.returnQuantity ?? body.quantity,
            refundAmount: body.refundAmount
        }]);
    }

    const totalRefund = computeTotalRefund(items, body.totalRefund);

    let date;
    if (Object.prototype.hasOwnProperty.call(body, 'date') && body.date !== undefined && body.date !== null && body.date !== '') {
        const parsed = new Date(body.date);
        if (Number.isNaN(parsed.getTime())) {
            errors.push('date must be a valid date');
        } else {
            date = parsed;
        }
    }

    const payload = {
        id,
        receiptId,
        originalSaleId: originalSaleId || undefined,
        items,
        totalRefund,
        reason: String(body.reason || '').trim(),
        cashierId: String(body.cashierId || body.employeeId || '').trim() || undefined,
        date
    };

    return { payload, errors };
}

function validateReturnItems(items) {
    const errors = [];
    items.forEach((item, index) => {
        if (!item.name) errors.push(`items[${index}].name is required`);
        if (item.price != null && item.price < 0) errors.push(`items[${index}].price must be >= 0`);
        if (item.quantity != null && item.quantity < 1) errors.push(`items[${index}].quantity must be >= 1`);
        if (item.returnQty == null || item.returnQty < 1) errors.push(`items[${index}].returnQty must be >= 1`);
        if (item.refundAmount == null || item.refundAmount < 0) errors.push(`items[${index}].refundAmount must be >= 0`);
    });
    return errors;
}

function validateReturnPayload(payload) {
    const errors = [];
    if (!payload.id) errors.push('id is required');
    if (!payload.receiptId) errors.push('receiptId is required');
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
        errors.push('items must be a non-empty array');
    } else {
        errors.push(...validateReturnItems(payload.items));
    }
    if (payload.totalRefund == null || payload.totalRefund < 0) {
        errors.push('totalRefund must be a non-negative number');
    }
    return errors;
}

function buildReturnUpdate(body = {}) {
    const errors = [];
    const updateData = {};

    if (Object.prototype.hasOwnProperty.call(body, 'receiptId') || Object.prototype.hasOwnProperty.call(body, 'saleId')) {
        const receiptId = String(body.receiptId || body.saleId || '').trim();
        if (!receiptId) errors.push('receiptId is required when updating receiptId');
        else updateData.receiptId = receiptId;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'originalSaleId') || Object.prototype.hasOwnProperty.call(body, 'saleId')) {
        const originalSaleId = String(body.originalSaleId || body.saleId || '').trim();
        if (originalSaleId) updateData.originalSaleId = originalSaleId;
    }

    const itemsProvided = Object.prototype.hasOwnProperty.call(body, 'items')
        || Object.prototype.hasOwnProperty.call(body, 'itemSku')
        || Object.prototype.hasOwnProperty.call(body, 'itemName')
        || Object.prototype.hasOwnProperty.call(body, 'name');

    let items = null;
    if (itemsProvided) {
        items = normalizeReturnItems(body.items);
        if (!items && (body.itemSku || body.itemName || body.name)) {
            items = normalizeReturnItems([{
                name: body.itemName || body.name || body.itemSku,
                price: body.price ?? body.unitPrice,
                quantity: body.quantity,
                returnQty: body.returnQty ?? body.returnQuantity ?? body.quantity,
                refundAmount: body.refundAmount
            }]);
        }
        if (!Array.isArray(items) || items.length === 0) {
            errors.push('items must be a non-empty array');
        } else {
            errors.push(...validateReturnItems(items));
            updateData.items = items;
        }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'totalRefund') || items) {
        const totalRefund = computeTotalRefund(items, body.totalRefund);
        if (totalRefund == null || totalRefund < 0) {
            errors.push('totalRefund must be a non-negative number');
        } else {
            updateData.totalRefund = totalRefund;
        }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'reason')) {
        updateData.reason = String(body.reason || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'cashierId') || Object.prototype.hasOwnProperty.call(body, 'employeeId')) {
        updateData.cashierId = String(body.cashierId || body.employeeId || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'date')) {
        if (body.date === null || body.date === '') {
            updateData.date = undefined;
        } else {
            const parsed = new Date(body.date);
            if (Number.isNaN(parsed.getTime())) {
                errors.push('date must be a valid date');
            } else {
                updateData.date = parsed;
            }
        }
    }

    return { updateData, errors };
}

// GET all (with pagination)
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            Return.find()
                .sort({ date: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Return.countDocuments()
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
        const data = await Return.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new
router.post('/', authenticateToken, async (req, res, next) => {
    try {
        const { payload, errors: normalizeErrors } = normalizeReturnPayload(req.body);
        const validationErrors = [
            ...normalizeErrors,
            ...validateReturnPayload(payload)
        ];

        if (validationErrors.length > 0) {
            return res.status(400).json({ error: 'Invalid return data', details: validationErrors });
        }

        const newItem = new Return(payload);
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
        const { updateData, errors } = buildReturnUpdate(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ error: 'Invalid return update', details: errors });
        }
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid return updates were provided.' });
        }

        const updated = await Return.findOneAndUpdate(
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
        const deleted = await Return.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
