const express = require('express');
const router = express.Router();
const Shift = require('../models/Shift');
const { authenticateToken, authorize } = require('../middleware/auth');

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

// FIXED: Add authentication to all routes
// GET all (with pagination)
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            Shift.find()
                .sort({ openTime: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Shift.countDocuments()
        ]);
        res.json({
            data,
            pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: skip + limit < total }
        });
    } catch (err) { next(err); }
});

// GET one
router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
        const data = await Shift.findOne({ id: req.params.id });
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) { next(err); }
});

// POST new - FIXED: Add auth and input validation
router.post('/', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { id, employeeId } = req.body;
        const errors = [];

        if (!id || typeof id !== 'string') errors.push('id is required and must be a string');
        if (!employeeId || typeof employeeId !== 'string') errors.push('employeeId is required and must be a string');

        const openTimeValue = req.body.openTime ?? req.body.date;
        if (!openTimeValue) {
            errors.push('openTime is required and must be a valid date/time');
        }
        const parsedOpenTime = openTimeValue ? new Date(openTimeValue) : null;
        if (parsedOpenTime && Number.isNaN(parsedOpenTime.getTime())) {
            errors.push('openTime must be a valid date/time');
        }

        const parsedCloseTime = req.body.closeTime ? new Date(req.body.closeTime) : null;
        if (req.body.closeTime && Number.isNaN(parsedCloseTime.getTime())) {
            errors.push('closeTime must be a valid date/time');
        }

        const startingCash = toNumber(req.body.startingCash);
        if (startingCash == null || startingCash < 0) {
            errors.push('startingCash is required and must be a non-negative number');
        }

        if (errors.length) return res.status(400).json({ errors });

        // FIXED: Validate only known fields
        const allowedFields = [
            'id', 'employeeId', 'employeeName', 'date', 'openTime', 'closeTime',
            'startingCash', 'expectedCash', 'actualCash', 'discrepancy', 'note', 'notes', 'status'
        ];
        for (const key in req.body) {
            if (!allowedFields.includes(key)) {
                return res.status(400).json({ error: `Unknown field: ${key}` });
            }
        }

        const payload = {
            id,
            employeeId,
            employeeName: req.body.employeeName ? String(req.body.employeeName).trim() : undefined,
            openTime: parsedOpenTime,
            closeTime: parsedCloseTime || undefined,
            startingCash: startingCash,
            expectedCash: toNumber(req.body.expectedCash) ?? undefined,
            actualCash: toNumber(req.body.actualCash) ?? undefined,
            discrepancy: toNumber(req.body.discrepancy) ?? undefined,
            note: req.body.note ? String(req.body.note).trim()
                : (req.body.notes ? String(req.body.notes).trim() : undefined),
            status: req.body.status
        };

        const newItem = new Shift(payload);
        const saved = await newItem.save();
        res.status(201).json(saved);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'ID already exists' });
        next(err);
    }
});

// PUT update - FIXED: Add auth
router.put('/:id', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const { id, ...updateData } = req.body;

        // FIXED: Validate unknown fields
        const allowedFields = [
            'employeeId', 'employeeName', 'date', 'openTime', 'closeTime',
            'startingCash', 'expectedCash', 'actualCash', 'discrepancy', 'note', 'notes', 'status'
        ];
        for (const key in updateData) {
            if (!allowedFields.includes(key)) {
                return res.status(400).json({ error: `Unknown field: ${key}` });
            }
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'openTime') || Object.prototype.hasOwnProperty.call(updateData, 'date')) {
            const openTimeValue = updateData.openTime ?? updateData.date;
            const parsedOpenTime = openTimeValue ? new Date(openTimeValue) : null;
            if (!parsedOpenTime || Number.isNaN(parsedOpenTime.getTime())) {
                return res.status(400).json({ error: 'openTime must be a valid date/time' });
            }
            updateData.openTime = parsedOpenTime;
            delete updateData.date;
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'closeTime')) {
            if (updateData.closeTime) {
                const parsedCloseTime = new Date(updateData.closeTime);
                if (Number.isNaN(parsedCloseTime.getTime())) {
                    return res.status(400).json({ error: 'closeTime must be a valid date/time' });
                }
                updateData.closeTime = parsedCloseTime;
            } else {
                updateData.closeTime = undefined;
            }
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'startingCash')) {
            const startingCash = toNumber(updateData.startingCash);
            if (startingCash == null || startingCash < 0) {
                return res.status(400).json({ error: 'startingCash must be a non-negative number' });
            }
            updateData.startingCash = startingCash;
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'expectedCash')) {
            const expectedCash = toNumber(updateData.expectedCash);
            if (expectedCash == null || expectedCash < 0) {
                return res.status(400).json({ error: 'expectedCash must be a non-negative number' });
            }
            updateData.expectedCash = expectedCash;
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'actualCash')) {
            const actualCash = toNumber(updateData.actualCash);
            if (actualCash == null || actualCash < 0) {
                return res.status(400).json({ error: 'actualCash must be a non-negative number' });
            }
            updateData.actualCash = actualCash;
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'discrepancy')) {
            const discrepancy = toNumber(updateData.discrepancy);
            if (discrepancy == null) {
                return res.status(400).json({ error: 'discrepancy must be a number' });
            }
            updateData.discrepancy = discrepancy;
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'notes')) {
            updateData.note = String(updateData.notes || '').trim();
            delete updateData.notes;
        }

        if (Object.prototype.hasOwnProperty.call(updateData, 'note')) {
            updateData.note = String(updateData.note || '').trim();
        }

        const updated = await Shift.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Not found' });
        res.json(updated);
    } catch (err) { next(err); }
});

// DELETE - FIXED: Add admin-only auth
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res, next) => {
    try {
        const deleted = await Shift.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
