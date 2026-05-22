const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const { authenticateToken, authorize } = require('../middleware/auth');

router.use(authenticateToken);
router.use(authorize('admin', 'manager'));

// GET all employees
router.get('/', async (req, res, next) => {
    try {
        const employees = await Employee.find().sort({ empId: 1 });
        res.json(employees);
    } catch (err) {
        next(err);
    }
});

// GET single employee
router.get('/:empId', async (req, res, next) => {
    try {
        const emp = await Employee.findOne({ empId: req.params.empId });
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        res.json(emp);
    } catch (err) {
        next(err);
    }
});

// POST new employee
router.post('/', async (req, res, next) => {
    try {
        const { empId, name, role, phone } = req.body;

        // Basic validation
        if (!empId || !name || !role || !phone) {
            return res.status(400).json({ error: 'Missing required fields: empId, name, role, phone' });
        }

        const newEmp = new Employee(req.body);
        const savedEmp = await newEmp.save();
        res.status(201).json(savedEmp);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Employee ID already exists' });
        }
        next(err);
    }
});

// PUT update employee
router.put('/:empId', async (req, res, next) => {
    try {
        // Prevent changing empId
        const { empId, ...updateData } = req.body;

        const updated = await Employee.findOneAndUpdate(
            { empId: req.params.empId },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Employee not found' });
        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// DELETE employee
router.delete('/:empId', async (req, res, next) => {
    try {
        const deleted = await Employee.findOneAndDelete({ empId: req.params.empId });
        if (!deleted) return res.status(404).json({ error: 'Employee not found' });
        res.json({ message: 'Employee deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
