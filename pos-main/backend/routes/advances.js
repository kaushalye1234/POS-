const express = require('express');
const router = express.Router();
const EmployeeAdvance = require('../models/EmployeeAdvance');

// GET all
router.get('/', async (req, res, next) => {
    try {
        const data = await EmployeeAdvance.find().sort({ createdAt: -1 });
        res.json(data);
    } catch (err) { next(err); }
});

// GET one
router.get('/:id', async (req, res, next) => {
    try {
        const data = await EmployeeAdvance.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new
router.post('/', async (req, res, next) => {
    try {
        const { id, employeeId, amount, reason, date } = req.body;

        // Basic validation
        if (!id || !employeeId || !amount) {
            return res.status(400).json({ error: 'Missing required fields: id, employeeId, amount' });
        }
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Amount must be a positive number' });
        }

        const newItem = new EmployeeAdvance(req.body);
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

        const updated = await EmployeeAdvance.findOneAndUpdate(
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
        const deleted = await EmployeeAdvance.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
