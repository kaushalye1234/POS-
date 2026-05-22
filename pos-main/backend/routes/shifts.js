const express = require('express');
const router = express.Router();
const Shift = require('../models/Shift');

// GET all
router.get('/', async (req, res, next) => {
    try {
        const data = await Shift.find().sort({ openTime: -1 });
        res.json(data);
    } catch (err) { next(err); }
});

// GET one
router.get('/:id', async (req, res, next) => {
    try {
        const data = await Shift.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new
router.post('/', async (req, res, next) => {
    try {
        const { id, employeeId, date, openTime, closeTime } = req.body;

        // Basic validation
        if (!id || !employeeId || !date) {
            return res.status(400).json({ error: 'Missing required fields: id, employeeId, date' });
        }

        const newItem = new Shift(req.body);
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

        const updated = await Shift.findOneAndUpdate(
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
        const deleted = await Shift.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
