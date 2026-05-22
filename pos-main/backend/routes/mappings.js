const express = require('express');
const router = express.Router();
const InventoryTransaction = require('../models/InventoryTransaction');
const Item = require('../models/Item');

// GET /api/mappings/suggestions
// Returns recent inventory transactions that have a scannedBarcode but no resolved SKU
router.get('/suggestions', async (req, res, next) => {
    try {
        const txs = await InventoryTransaction.find({ scannedBarcode: { $exists: true, $ne: null } }).sort({ createdAt: -1 }).limit(200);

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
        res.json(suggestions);
    } catch (err) {
        next(err);
    }
});

// POST /api/mappings/map
// body: { scannedBarcode, sku }
router.post('/map', async (req, res, next) => {
    try {
        const { scannedBarcode, sku } = req.body || {};
        if (!scannedBarcode || !sku) return res.status(400).json({ error: 'Missing scannedBarcode or sku' });

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
