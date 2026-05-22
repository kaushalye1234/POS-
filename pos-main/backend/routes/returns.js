const express = require('express');
const router = express.Router();
const Return = require('../models/Return');

// GET all
router.get('/', async (req, res, next) => {
    try {
        const data = await Return.find().sort({ date: -1 });
        res.json(data);
    } catch (err) { next(err); }
});

// GET one
router.get('/:id', async (req, res, next) => {
    try {
        const data = await Return.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new
router.post('/', async (req, res, next) => {
    try {
        const { id, saleId, itemSku, quantity, reason } = req.body;

        // Basic validation
        if (!id || !saleId || !itemSku) {
            return res.status(400).json({ error: 'Missing required fields: id, saleId, itemSku' });
        }
        if (quantity !== undefined && typeof quantity !== 'number') {
            return res.status(400).json({ error: 'Quantity must be a number' });
        }

        const newItem = new Return(req.body);
        const saved = await newItem.save();
        res.status(201).json(saved);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'ID already exists' });
        next(err);
    }
});

// PUT update
router.put('/:id', async (req, res, next) => {
    try {
        // Prevent changing id
        const { id, ...updateData } = req.body;

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
router.delete('/:id', async (req, res, next) => {
    try {
        const deleted = await Return.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
