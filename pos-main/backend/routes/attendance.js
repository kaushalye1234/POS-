const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const { authenticateToken, authorize } = require('../middleware/auth');

// Helper to escape regex special characters
function escapeRegexChars(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const filter = {};

        if (req.query.employeeId) {
            filter.employeeId = String(req.query.employeeId).trim();
        }

        if (req.query.date) {
            filter.date = String(req.query.date).trim();
        } else if (req.query.month) {
            // FIXED: Validate and escape regex input to prevent ReDoS
            const monthStr = String(req.query.month).trim();
            if (!/^\d{4}-\d{2}$/.test(monthStr)) {
                return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
            }
            filter.date = new RegExp(`^${escapeRegexChars(monthStr)}-`);
        }

        const records = await Attendance.find(filter)
            .sort({ date: -1, employeeId: 1 })
            .limit(1000);  // Add safety limit
        
        res.json(records);
    } catch (err) {
        next(err);
    }
});

router.post('/', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { employeeId, employeeName, date, status, note, markedBy } = req.body;

        if (!employeeId || !date) {
            return res.status(400).json({ error: 'Missing required fields: employeeId, date' });
        }

        // Validate status
        if (status && !['present', 'absent', 'late', 'leave', 'half-day'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const payload = {
            employeeId: String(employeeId).trim(),
            employeeName: employeeName ? String(employeeName).trim() : '',
            date: String(date).trim(),
            status: status || 'present',
            note: note ? String(note).trim() : '',
            markedBy: markedBy ? String(markedBy).trim() : ''
        };

        const attendance = await Attendance.findOneAndUpdate(
            { employeeId: payload.employeeId, date: payload.date },
            {
                $set: payload,
                $setOnInsert: { id: req.body.id || Date.now().toString() }
            },
            {
                upsert: true,
                returnDocument: 'after',
                runValidators: true
            }
        );

        res.status(201).json(attendance);
    } catch (err) {
        next(err);
    }
});

router.put('/:id', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { id, ...updateData } = req.body;

        // Validate status if provided
        if (updateData.status && !['present', 'absent', 'late', 'leave', 'half-day'].includes(updateData.status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const updated = await Attendance.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ error: 'Attendance record not found' });
        }

        res.json(updated);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
