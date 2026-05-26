const express = require('express');
const router = express.Router();
const InventoryTransaction = require('../models/InventoryTransaction');
const Item = require('../models/Item');
const { authenticateToken, authorize } = require('../middleware/auth');

// GET /api/mappings/suggestions - FIXED: Add auth
// Returns recent inventory transactions that have a scannedBarcode but no resolved SKU
router.get('/suggestions', authenticateToken, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const txs = await InventoryTransaction.find({ 
            scannedBarcode: { $exists: true, $ne: null } 
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const results = await Promise.all(txs.map(async tx => {
            let itemExists = false;
            if (tx.sku) {
                itemExists = await Item.exists({ sku: tx.sku });
            }
            return {
                id: tx._id,
                scannedBarcode: tx.scannedBarcode,
                sku: tx.sku || null,
                priceUsed: tx.priceUsed || null,
                quantity: tx.quantity || null,
                source: tx.source,
                createdAt: tx.createdAt,
                itemExists: !!itemExists
            };
        }));

        // Filter suggestions where sku missing or sku does not exist in Items
        const suggestions = results.filter(r => !r.sku || !r.itemExists);
        const total = await InventoryTransaction.countDocuments({ 
            scannedBarcode: { $exists: true, $ne: null } 
        });
        
        res.json({
            data: suggestions,
            pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: skip + limit < total }
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/mappings/map - FIXED: Add auth and input validation
// body: { scannedBarcode, sku }
router.post('/map', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { scannedBarcode, sku } = req.body || {};
        const errors = [];

        if (!scannedBarcode || typeof scannedBarcode !== 'string') {
            errors.push('scannedBarcode is required and must be a string');
        }
        if (!sku || typeof sku !== 'string') {
            errors.push('sku is required and must be a string');
        }
        
        if (errors.length) return res.status(400).json({ errors });

        // FIXED: Validate unknown fields
        const allowedFields = ['scannedBarcode', 'sku'];
        for (const key in req.body) {
            if (!allowedFields.includes(key)) {
                return res.status(400).json({ error: `Unknown field: ${key}` });
            }
        }

        const item = await Item.findOne({ sku });
        if (!item) return res.status(404).json({ error: 'SKU not found' });

        const update = await InventoryTransaction.updateMany(
            { scannedBarcode },
            { $set: { sku: item.sku, notes: `Mapped to SKU ${item.sku}` } }
        );

        const affected = update.modifiedCount || update.nModified || update.n || 0;
        res.json({ ok: true, mappedTo: item.sku, affected });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
