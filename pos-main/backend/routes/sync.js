const express = require('express');
const router = express.Router();
const { getSyncStatus, runSync } = require('../syncService');

router.get('/status', (req, res) => {
    res.json(getSyncStatus());
});

router.post('/run', async (req, res, next) => {
    try {
        const summary = await runSync({
            direction: req.body?.direction || 'active-to-standby',
            collections: req.body?.collections,
            reason: 'api'
        });

        res.json({
            message: 'MongoDB sync completed successfully.',
            summary
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        next(error);
    }
});

module.exports = router;
