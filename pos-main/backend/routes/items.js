const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Item = require('../models/Item');
const { generateSKU } = require('../utils/skuGenerator');
const { importItemsFromCSV } = require('../utils/importer');
const { authenticateToken, authorize } = require('../middleware/auth');

// FIXED: Add authentication and authorization middleware
// GET all items (with pagination)
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            Item.find()
                .sort({ sku: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Item.countDocuments()
        ]);

        res.json({
            data: items,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: skip + limit < total
            }
        });
    } catch (err) {
        next(err);
    }
});

// CSV import endpoint
// FIXED: Add authorization check
router.post('/import', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
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
router.get('/:sku', authenticateToken, async (req, res, next) => {
    try {
        const item = await Item.findOne({ sku: req.params.sku });
        if (!item) return res.status(404).json({ error: 'Item not found' });
        res.json(item);
    } catch (err) {
        next(err);
    }
});

// POST new item (handles Auto-Generated SKUs or explicit SKUs)
// FIXED: Add authorization, input validation
router.post('/', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { name, price, stockLevel, category, description, barcode, sku: providedSku, reorderLevel, supplier } = req.body;

        // FIXED: Validate required fields
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Missing or invalid required field: name (must be non-empty string)' });
        }

        if (price === undefined || typeof price !== 'number' || price < 0) {
            return res.status(400).json({ error: 'Price is required and must be a non-negative number' });
        }

        // FIXED: Validate optional numeric fields
        if (stockLevel !== undefined) {
            if (typeof stockLevel !== 'number' || stockLevel < 0 || !Number.isInteger(stockLevel)) {
                return res.status(400).json({ error: 'Stock level must be a non-negative integer' });
            }
        }

        if (reorderLevel !== undefined) {
            if (typeof reorderLevel !== 'number' || reorderLevel < 0 || !Number.isInteger(reorderLevel)) {
                return res.status(400).json({ error: 'Reorder level must be a non-negative integer' });
            }
        }

        // Validate optional string fields
        const validationMap = {
            category: 100,
            description: 1000,
            barcode: 50,
            supplier: 100
        };

        for (const [field, maxLen] of Object.entries(validationMap)) {
            if (req.body[field] !== undefined && (typeof req.body[field] !== 'string' || req.body[field].length > maxLen)) {
                return res.status(400).json({ error: `${field} must be a string with max ${maxLen} characters` });
            }
        }

        // FIXED: Build item data with only allowed fields
        const itemData = {
            name: name.trim(),
            price: parseFloat(price),
            stockLevel: stockLevel ?? 0,
            category: category ? String(category).trim() : undefined,
            description: description ? String(description).trim() : undefined,
            barcode: barcode ? String(barcode).trim() : undefined,
            reorderLevel: reorderLevel ?? 0,
            supplier: supplier ? String(supplier).trim() : undefined
        };

        // Generate a category-aware SKU if none provided
        if (!providedSku) {
            itemData.sku = generateSKU(itemData.category || itemData.name || 'OTHER');
        } else {
            itemData.sku = String(providedSku).trim();
        }

        const newItem = new Item(itemData);
        const savedItem = await newItem.save();
        res.status(201).json(savedItem);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'SKU already exists' });
        }
        next(err);
    }
});

// PUT update item
// FIXED: Add authorization, input validation
router.put('/:sku', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        // Prevent changing sku
        const { sku: _sku, ...updateData } = req.body;

        // FIXED: Reject unknown fields
        const allowedFields = ['name', 'price', 'stockLevel', 'category', 'description', 'barcode', 'reorderLevel', 'supplier'];
        const unknownFields = Object.keys(updateData).filter(key => !allowedFields.includes(key));
        
        if (unknownFields.length > 0) {
            return res.status(400).json({
                error: 'Unknown fields in request',
                unknownFields
            });
        }

        // Validate types and values
        if (updateData.name !== undefined && (typeof updateData.name !== 'string' || updateData.name.trim().length === 0)) {
            return res.status(400).json({ error: 'name must be a non-empty string' });
        }

        if (updateData.price !== undefined && (typeof updateData.price !== 'number' || updateData.price < 0)) {
            return res.status(400).json({ error: 'price must be a non-negative number' });
        }

        if (updateData.stockLevel !== undefined && (typeof updateData.stockLevel !== 'number' || updateData.stockLevel < 0)) {
            return res.status(400).json({ error: 'stockLevel must be a non-negative number' });
        }

        // Clean up the data (trim strings)
        const cleanedData = {};
        for (const [key, value] of Object.entries(updateData)) {
            if (typeof value === 'string') {
                cleanedData[key] = value.trim();
            } else {
                cleanedData[key] = value;
            }
        }

        const updated = await Item.findOneAndUpdate(
            { sku: req.params.sku },
            { $set: cleanedData },
            { returnDocument: 'after', runValidators: true }
        );

        if (!updated) return res.status(404).json({ error: 'Item not found' });
        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// DELETE item
// FIXED: Add authorization check
router.delete('/:sku', authenticateToken, authorize('admin'), async (req, res, next) => {
    try {
        const deleted = await Item.findOneAndDelete({ sku: req.params.sku });
        if (!deleted) return res.status(404).json({ error: 'Item not found' });
        res.json({ message: 'Item deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
