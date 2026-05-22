const express = require('express');
const crypto = require('crypto');
const bwipjs = require('bwip-js');

const router = express.Router();
const Item = require('../models/Item');
const { parseBarcode } = require('../utils/barcodeParser');

function computeEan13CheckDigit(first12) {
    const digits = String(first12).replace(/\D/g, '').slice(0, 12).split('').map(d => parseInt(d, 10));
    if (digits.length !== 12 || digits.some(Number.isNaN)) return null;

    let sumOdd = 0;
    let sumEven = 0;
    for (let i = 0; i < digits.length; i++) {
        // i=0 is position 1 (odd)
        if ((i % 2) === 0) sumOdd += digits[i];
        else sumEven += digits[i];
    }
    const total = sumOdd + (sumEven * 3);
    return (10 - (total % 10)) % 10;
}

function randomDigits(count) {
    let out = '';
    for (let i = 0; i < count; i++) out += String(crypto.randomInt(0, 10));
    return out;
}

function toYYMMDD(dateLike) {
    const d = dateLike ? new Date(dateLike) : new Date();
    if (Number.isNaN(d.getTime())) return toYYMMDD(new Date());
    const yy = String(d.getUTCFullYear()).slice(-2);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
}

function categoryCode(category) {
    const raw = String(category || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw) return 'OTH';
    return raw.slice(0, 3).padEnd(3, 'X');
}

function priceBandCode(price) {
    const p = Number(price);
    const thresholds = [0, 1000, 2000, 5000, 10000, 20000];
    let band = 0;
    for (let i = 0; i < thresholds.length; i++) {
        if (p >= thresholds[i]) band = i;
    }
    return String(band).padStart(2, '0');
}

function structuredBarcodeFromFields({ sku, category, price, storedAt }) {
    const s = String(sku || '').trim();
    if (!s) throw new Error('Missing sku');
    const cat = categoryCode(category);
    const pb = priceBandCode(price);
    const dt = toYYMMDD(storedAt);
    return `FS-${cat}-${pb}-${dt}-${s}`;
}

async function generateUniqueEan13(prefix = '2', maxAttempts = 30) {
    const cleanPrefix = String(prefix || '2').replace(/\D/g, '').slice(0, 6) || '2';
    const remaining = 12 - cleanPrefix.length;
    if (remaining < 1) throw new Error('Invalid EAN prefix');

    for (let i = 0; i < maxAttempts; i++) {
        const first12 = cleanPrefix + randomDigits(remaining);
        const check = computeEan13CheckDigit(first12);
        if (check === null) continue;
        const code = `${first12}${check}`;

        // Ensure uniqueness against existing items
        // (barcode is sparse+unique, but we fail fast with a lookup)
        const exists = await Item.exists({ barcode: code });
        if (!exists) return code;
    }
    throw new Error('Failed to generate a unique barcode');
}

// POST /api/barcode/parse
// body: { code: '<scanned string>' }
router.post('/parse', async (req, res, next) => {
    try {
        const { code } = req.body || {};
        if (!code) return res.status(400).json({ error: 'Missing code' });

        const parsed = parseBarcode(code);
        let item = null;

        if (parsed && parsed.sku) {
            // Try to look up item by SKU/GTIN or by barcode field
            try {
                item = await Item.findOne({ $or: [{ sku: parsed.sku }, { barcode: parsed.sku }] });
            } catch (err) {
                // ignore DB lookup errors and continue
                console.error('Item lookup failed in barcode parse route:', err.message);
            }
        }

        return res.json({ parsed, item });
    } catch (err) {
        next(err);
    }
});

// POST /api/barcode/generate
// body:
//  - { format?: 'ean13', prefix?: '2' }
//  - { format: 'structured', sku: 'ITM-1', category?: '...', price?: 0, storedAt?: 'YYYY-MM-DD'|'ISO' }
router.post('/generate', async (req, res, next) => {
    try {
        const { format, prefix, sku, category, price, storedAt } = req.body || {};
        const fmt = String(format || 'ean13');

        if (fmt === 'ean13') {
            const code = await generateUniqueEan13(prefix || '2');
            return res.json({ format: 'ean13', code });
        }

        if (fmt === 'structured') {
            const code = structuredBarcodeFromFields({ sku, category, price, storedAt });
            return res.json({ format: 'structured', code });
        }

        return res.status(400).json({ error: "Unsupported format. Use 'ean13' or 'structured'." });
    } catch (err) {
        next(err);
    }
});

// POST /api/barcode/assign
// body: { sku: 'ITM-1', format?: 'ean13', prefix?: '2' }
router.post('/assign', async (req, res, next) => {
    try {
        const { sku, format, prefix } = req.body || {};
        if (!sku) return res.status(400).json({ error: 'Missing sku' });

        const fmt = String(format || 'ean13');

        const item = await Item.findOne({ sku: String(sku) });
        if (!item) return res.status(404).json({ error: 'Item not found' });

        if (fmt === 'ean13') {
            item.barcode = await generateUniqueEan13(prefix || '2');
            const saved = await item.save();
            return res.json(saved);
        }

        if (fmt === 'structured') {
            item.barcode = structuredBarcodeFromFields({
                sku: item.sku,
                category: item.category,
                price: item.price,
                storedAt: item.storedAt || item.createdAt
            });
            const saved = await item.save();
            return res.json(saved);
        }

        return res.status(400).json({ error: "Unsupported format. Use 'ean13' or 'structured'." });
    } catch (err) {
        // Handle unique constraint collision (rare) by retrying once (EAN-13 only)
        if (err && err.code === 11000) {
            try {
                const { sku, prefix } = req.body || {};
                const item = await Item.findOne({ sku: String(sku) });
                if (!item) return res.status(404).json({ error: 'Item not found' });
                item.barcode = await generateUniqueEan13(prefix || '2');
                const saved = await item.save();
                return res.json(saved);
            } catch (e2) {
                return next(e2);
            }
        }
        next(err);
    }
});

// POST /api/barcode/render
// body: { text: '123...', symbology?: 'ean13'|'code128', scale?: number, height?: number, includetext?: boolean }
router.post('/render', async (req, res, next) => {
    try {
        const { text, symbology, scale, height, includetext } = req.body || {};
        const t = String(text || '').trim();
        if (!t) return res.status(400).json({ error: 'Missing text' });

        const sym = String(symbology || 'code128');
        const bcid = sym === 'ean13' ? 'ean13' : 'code128';

        const png = await bwipjs.toBuffer({
            bcid,
            text: t,
            scale: Number.isFinite(scale) ? scale : 3,
            height: Number.isFinite(height) ? height : 12,
            includetext: includetext !== false,
            textxalign: 'center'
        });

        res.json({ mime: 'image/png', data: png.toString('base64') });
    } catch (err) {
        next(err);
    }
});

module.exports = router;