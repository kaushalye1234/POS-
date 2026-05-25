const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Sale = require('../models/Sale');
const Item = require('../models/Item');
const InventoryTransaction = require('../models/InventoryTransaction');
const config = require('../config');
const { getBusinessTimestampParts } = require('../utils/businessTime');

// ============================================
// SEC-005: Input validation helper
// ============================================
function validateSaleInput(body) {
    const errors = [];

    if (!body.employeeId || typeof body.employeeId !== 'string') {
        errors.push('employeeId is required and must be a string.');
    }

    if (typeof body.totalAmount !== 'number' || body.totalAmount < 0) {
        errors.push('totalAmount must be a non-negative number.');
    }

    if (typeof body.amountReceived !== 'number' || body.amountReceived < 0) {
        errors.push('amountReceived must be a non-negative number.');
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
        errors.push('items must be a non-empty array.');
    } else {
        body.items.forEach((item, i) => {
            if (!item.itemName && !item.name) {
                errors.push(`items[${i}]: itemName or name is required.`);
            }
            if (typeof item.quantity !== 'number' || item.quantity < 1) {
                errors.push(`items[${i}]: quantity must be >= 1.`);
            }
            if (typeof item.unitPrice !== 'number' && typeof item.price !== 'number') {
                errors.push(`items[${i}]: unitPrice or price is required as a number.`);
            }
            const price = item.unitPrice || item.price || 0;
            if (price < 0) {
                errors.push(`items[${i}]: price cannot be negative.`);
            }
        });
    }

    return errors;
}

// ============================================
// GET /api/sales — with pagination (BACK-004 fix)
// ============================================
router.get('/', async (req, res, next) => {
    try {
        const { date, page = 1, limit = 50 } = req.query;
        const filter = date ? { saleDate: date } : {};
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

        const [sales, total] = await Promise.all([
            Sale.find(filter)
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum),
            Sale.countDocuments(filter)
        ]);

        res.json({
            data: sales,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        next(err);
    }
});

// ============================================
// POST /api/sales — Create sale with validation + atomic stock
// ============================================
router.post('/', async (req, res, next) => {
    let session = null;
    let useSession = false;

    try {
        // SEC-005: Validate input before processing
        const validationErrors = validateSaleInput(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Invalid sale data',
                details: validationErrors
            });
        }

        // BACK-002 FIX: Use cached transaction support flag instead of probing every sale
        const getSupportsTransactions = req.app.get('supportsTransactions');
        useSession = typeof getSupportsTransactions === 'function'
            ? getSupportsTransactions()
            : false;

        if (useSession) {
            session = await mongoose.startSession();
            try {
                await session.startTransaction();
            } catch (txErr) {
                console.warn('Transactions not supported, proceeding without:', txErr.message);
                useSession = false;
                await session.endSession();
                session = null;
            }
        }

        // Build a sanitized sale data object (don't trust req.body wholesale)
        const now = new Date();
        const businessNow = getBusinessTimestampParts(now, config.businessTimeZone);
        const saleDate = req.body.saleDate || businessNow.saleDate;
        const saleTime = req.body.saleTime || businessNow.saleTime;
        const saleData = {
            employeeId: String(req.body.employeeId).trim(),
            items: req.body.items.map(item => {
                const quantity = Math.max(1, Math.round(Number(item.quantity)));
                const unitPrice = Math.max(0, Number(item.unitPrice || item.price || 0));
                const totalPrice = Math.max(0, Number(item.totalPrice || item.lineTotal || item.total || (unitPrice * quantity)));

                return {
                    itemName: String(item.itemName || item.name || '').trim(),
                    sku: item.sku ? String(item.sku).trim() : undefined,
                    category: item.category ? String(item.category).trim() : undefined,
                    quantity,
                    unitPrice,
                    totalPrice,
                    discountEligible: !!item.discountEligible,
                    priceFromBarcode: !!item.priceFromBarcode
                };
            }),
            totalAmount: Math.max(0, Number(req.body.totalAmount)),
            subTotal: Math.max(0, Number(req.body.subTotal || (req.body.totalAmount + (req.body.discount || 0)))),
            discount: Math.max(0, Number(req.body.discount || 0)),
            amountReceived: Math.max(0, Number(req.body.amountReceived)),
            changeAmount: Number(req.body.changeAmount || req.body.changeGiven || 0),
            saleDate,
            saleTime,
            itemsCount: req.body.items.length,
            customerId: req.body.customerId || null,
            customerName: req.body.customerName || null,
            paymentMethod: String(req.body.paymentMethod || 'CASH').trim().toUpperCase(),
            status: ['completed', 'voided', 'refunded'].includes(String(req.body.status || '').toLowerCase())
                ? String(req.body.status).toLowerCase()
                : 'completed',
            notes: String(req.body.notes || '').trim().slice(0, 1000)
        };

        // ============================================
        // SEC-006 FIX: Atomic stock check + decrement
        // Use findOneAndUpdate with $gte filter so the decrement
        // only succeeds if stock is sufficient — prevents negative stock
        // ============================================
        if (saleData.items.length > 0) {
            for (const item of saleData.items) {
                if (item.sku) {
                    const opts = useSession ? { session } : {};
                    const result = await Item.findOneAndUpdate(
                        {
                            sku: item.sku,
                            stockLevel: { $gte: item.quantity } // Atomic guard
                        },
                        { $inc: { stockLevel: -item.quantity } },
                        { returnDocument: 'after', ...opts }
                    );

                    if (!result) {
                        // Either SKU not found OR insufficient stock
                        const existing = await Item.findOne({ sku: item.sku });
                        if (!existing) {
                            if (useSession) await session.abortTransaction();
                            return res.status(400).json({
                                error: `Item with SKU ${item.sku} not found in inventory.`
                            });
                        }
                        if (useSession) await session.abortTransaction();
                        return res.status(400).json({
                            error: `Insufficient stock for ${item.itemName || item.sku}`,
                            available: existing.stockLevel,
                            requested: item.quantity
                        });
                    }
                }
            }
        }

        // Save the Sale Record
        const newSale = new Sale(saleData);
        const savedSale = useSession
            ? await newSale.save({ session })
            : await newSale.save();

        // Record inventory transactions for audit trail
        const auditErrors = [];
        for (const item of savedSale.items) {
            if (item.sku) {
                try {
                    const tx = new InventoryTransaction({
                        sku: item.sku,
                        change: -Math.abs(item.quantity),
                        quantity: item.quantity,
                        source: 'sale',
                        saleId: savedSale._id,
                        userId: savedSale.employeeId || null,
                        priceUsed: item.unitPrice || null,
                        scannedBarcode: item.sku || null
                    });
                    if (useSession) await tx.save({ session }); else await tx.save();
                } catch (txErr) {
                    // BACK-003: Log audit failures instead of silently swallowing
                    auditErrors.push({ sku: item.sku, error: txErr.message });
                    console.error('Audit trail failure for', item.sku, txErr.message);
                }
            }
        }

        if (useSession) await session.commitTransaction();

        // Include audit warnings in response if any
        const response = { ...savedSale.toObject() };
        if (auditErrors.length > 0) {
            response._warnings = {
                message: 'Sale completed but some audit records failed to save.',
                failures: auditErrors
            };
        }

        res.status(201).json(response);
    } catch (err) {
        if (session && useSession) {
            try { await session.abortTransaction(); } catch(e) {}
        }
        next(err);
    } finally {
        if (session) session.endSession();
    }
});

// ============================================
// GET /api/sales/analytics/summary
// ============================================
router.get('/analytics/summary', async (req, res, next) => {
    try {
        const summary = await Sale.aggregate([
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalAmount" },
                    totalDiscounts: { $sum: "$discount" },
                    totalSales: { $sum: 1 },
                    totalItemsSold: { $sum: "$itemsCount" }
                }
            }
        ]);

        res.json(summary[0] || {
            totalRevenue: 0,
            totalDiscounts: 0,
            totalSales: 0,
            totalItemsSold: 0
        });
    } catch (err) {
        next(err);
    }
});

// ============================================
// PUT /api/sales/:id — update sale metadata
// ============================================
router.put('/:id', async (req, res, next) => {
    try {
        const updates = {};

        if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
            updates.notes = String(req.body.notes || '').trim().slice(0, 1000);
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
            const normalizedStatus = String(req.body.status || '').trim().toLowerCase();
            if (!['completed', 'voided', 'refunded'].includes(normalizedStatus)) {
                return res.status(400).json({ error: 'Invalid sale status.' });
            }
            updates.status = normalizedStatus;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'paymentMethod')) {
            updates.paymentMethod = String(req.body.paymentMethod || 'CASH').trim().toUpperCase().slice(0, 32);
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid sale updates were provided.' });
        }

        const updatedSale = await Sale.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updatedSale) {
            return res.status(404).json({ error: 'Sale not found.' });
        }

        res.json(updatedSale);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
