const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Item = require('../models/Item');
const { generateSKU } = require('../utils/skuGenerator');
const { importItemsFromCSV } = require('../utils/importer');

// GET all items
router.get('/', async (req, res, next) => {
    try {
        const items = await Item.find().sort({ sku: 1 });
        res.json(items);
    } catch (err) {
        next(err);
    }
});

// CSV import endpoint
// NOTE: must be registered BEFORE "/:sku" routes, otherwise it will be treated as a SKU.
router.post('/import', async (req, res, next) => {
    let session = null;
    let useSession = false;
    try {
        const csv = req.body && req.body.csv;
        if (!csv) return res.status(400).json({ error: 'Missing csv payload' });

        // Detect if MongoDB supports transactions (replica set or sharded)
        try {
            const admin = mongoose.connection.db.admin();
            const probe = await admin.command({ hello: 1 }).catch(() => admin.command({ ismaster: 1 }));
            if (probe && (probe.setName || probe.msg === 'isdbgrid')) {
                useSession = true;
            }
        } catch {
            useSession = false;
        }

        if (useSession) {
            session = await mongoose.startSession();
            try {
                await session.startTransaction();
            } catch (txErr) {
                console.warn('Transactions not supported by MongoDB server, proceeding without transaction:', txErr.message);
                useSession = false;
                await session.endSession();
                session = null;
            }
        }

        const result = await importItemsFromCSV(csv, useSession ? session : null);

        if (useSession) await session.commitTransaction();
        res.json(result);
    } catch (err) {
        if (session && useSession) await session.abortTransaction();
        next(err);
    } finally {
        if (session) session.endSession();
    }
});

// GET single item by SKU
router.get('/:sku', async (req, res, next) => {
    try {
        const item = await Item.findOne({ sku: req.params.sku });
        if (!item) return res.status(404).json({ error: 'Item not found' });
        res.json(item);
    } catch (err) {
        next(err);
    }
});

// POST new item (handles Auto-Generated SKUs or explicit SKUs)
router.post('/', async (req, res, next) => {
    try {
        const { name, price, stockLevel } = req.body;

        // Basic validation
        if (!name) {
            return res.status(400).json({ error: 'Missing required field: name' });
        }
        if (price !== undefined && typeof price !== 'number') {
            return res.status(400).json({ error: 'Price must be a number' });
        }
        if (stockLevel !== undefined && typeof stockLevel !== 'number') {
            return res.status(400).json({ error: 'Stock level must be a number' });
        }

        const itemData = req.body;
        // Generate a category-aware SKU if none provided
        if (!itemData.sku) {
            itemData.sku = generateSKU(itemData.category || itemData.name || 'OTHER');
        }

        const newItem = new Item(itemData);
        const savedItem = await newItem.save();
        res.status(201).json(savedItem);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'SKU already exists' });
        }
        next(err);
    }
});

// PUT update item — BACK-006: runValidators ensures schema rules apply on updates
router.put('/:sku', async (req, res, next) => {
    try {
        // Prevent changing sku
        const { sku, ...updateData } = req.body;

        const updated = await Item.findOneAndUpdate(
            { sku: req.params.sku },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Item not found' });
        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// DELETE item
router.delete('/:sku', async (req, res, next) => {
    try {
        const deleted = await Item.findOneAndDelete({ sku: req.params.sku });
        if (!deleted) return res.status(404).json({ error: 'Item not found' });
        res.json({ message: 'Item deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
