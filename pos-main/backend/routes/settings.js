const express = require('express');
const router = express.Router();

const PosSettings = require('../models/PosSettings');
const { authorize } = require('../middleware/auth');

function toPublicSettings(doc) {
    return {
        saleEntryMode: doc.saleEntryMode,
        allowManualSales: doc.saleEntryMode === 'manual_allowed',
        updatedBy: doc.updatedBy || null,
        updatedAt: doc.updatedAt || null
    };
}

router.get('/pos', async (req, res, next) => {
    try {
        const settings = await PosSettings.getCurrent();
        res.json(toPublicSettings(settings));
    } catch (err) {
        next(err);
    }
});

router.put('/pos', authorize('admin'), async (req, res, next) => {
    try {
        const { saleEntryMode } = req.body || {};
        const validModes = PosSettings.getSaleEntryModes();

        if (!validModes.includes(saleEntryMode)) {
            return res.status(400).json({
                error: `saleEntryMode must be one of: ${validModes.join(', ')}`
            });
        }

        const settings = await PosSettings.findOneAndUpdate(
            { key: 'pos-settings' },
            {
                $set: {
                    saleEntryMode,
                    updatedBy: req.user?.username || req.user?.id || null
                },
                $setOnInsert: {
                    key: 'pos-settings'
                }
            },
            {
                returnDocument: 'after',
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        res.json(toPublicSettings(settings));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
