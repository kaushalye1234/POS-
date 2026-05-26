const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Sale = require('../models/Sale');
const Item = require('../models/Item');
const InventoryTransaction = require('../models/InventoryTransaction');
const PosSettings = require('../models/PosSettings');
const config = require('../config');
const { getBusinessTimestampParts } = require('../utils/businessTime');
const { authenticateToken, authorize } = require('../middleware/auth');  // FIXED: Add auth

function createBadRequestError(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

// ============================================
// SEC-005: Input validation helper
// ============================================
function validateSaleInput(body) {
    const errors = [];

    if (!body.employeeId || typeof body.employeeId !== 'string') {
        errors.push('employeeId is required and must be a string.');
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

    // FIXED: Don't validate client-provided totals - we'll compute them server-side
    if (typeof body.amountReceived !== 'number' || body.amountReceived < 0) {
        errors.push('amountReceived must be a non-negative number.');
    }

    return errors;
}

// FIXED: New helper to compute correct totals from database item prices
async function computeSaleTotals(itemsFromClient, discountPercentage = 0, options = {}) {
    if (!Array.isArray(itemsFromClient) || itemsFromClient.length === 0) {
        throw new Error('items must be non-empty array');
    }

    const allowManualSales = options.allowManualSales === true;

    // Look up current prices from database for each item
    const itemsWithDbPrices = await Promise.all(
        itemsFromClient.map(async (clientItem) => {
            if (!clientItem.sku) {
                if (!allowManualSales) {
                    const missingName = clientItem.itemName || clientItem.name || 'Manual item';
                    throw createBadRequestError(`Manual item "${missingName}" is not allowed while Inventory Only mode is active.`);
                }

                const quantity = parseInt(clientItem.quantity);
                if (quantity < 1 || !isFinite(quantity)) {
                    throw createBadRequestError('Invalid quantity for manual sale item');
                }

                const unitPrice = Number(clientItem.unitPrice ?? clientItem.price);
                if (!isFinite(unitPrice) || unitPrice < 0) {
                    throw createBadRequestError('Manual sale items require a valid non-negative price');
                }

                const itemName = String(clientItem.itemName || clientItem.name || '').trim();
                if (!itemName) {
                    throw createBadRequestError('Manual sale items require an item name');
                }

                const lineTotal = quantity * unitPrice;

                return {
                    sku: null,
                    itemName,
                    quantity,
                    unitPrice,
                    lineTotal,
                    categoryFromDb: String(clientItem.category || '').trim() || null,
                    entryMode: 'manual'
                };
            }

            const dbItem = await Item.findOne({ sku: clientItem.sku });
            if (!dbItem) {
                throw createBadRequestError(`Item not found: ${clientItem.sku}`);
            }

            const quantity = parseInt(clientItem.quantity);
            if (quantity < 1 || !isFinite(quantity)) {
                throw createBadRequestError(`Invalid quantity for ${clientItem.sku}`);
            }

            // Use database price, not client price!
            const unitPrice = dbItem.price;
            const lineTotal = quantity * unitPrice;

            return {
                sku: clientItem.sku,
                itemName: clientItem.itemName || clientItem.name || dbItem.name,
                quantity,
                unitPrice,
                lineTotal,
                categoryFromDb: dbItem.category,
                entryMode: 'inventory'
            };
        })
    );

    // Calculate totals from actual database prices
    const subtotal = itemsWithDbPrices.reduce((sum, item) => sum + item.lineTotal, 0);

    // Validate and apply discount
    const discountPct = Math.min(100, Math.max(0, discountPercentage || 0));
    const discountAmount = subtotal * (discountPct / 100);
    const totalAmount = subtotal - discountAmount;

    return {
        items: itemsWithDbPrices,
        subtotal: parseFloat(subtotal.toFixed(2)),
        discountPercentage: discountPct,
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        totalAmount: parseFloat(totalAmount.toFixed(2))
    };
}

// ============================================
// GET /api/sales — with pagination (BACK-004 fix)
// ============================================
router.get('/', authenticateToken, async (req, res, next) => {
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
router.post('/', authenticateToken, async (req, res, next) => {
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

        const posSettings = await PosSettings.getCurrent();
        const allowManualSales = posSettings.saleEntryMode === 'manual_allowed';

        // FIXED: Compute totals server-side from database prices
        let totals;
        try {
            totals = await computeSaleTotals(
                req.body.items,
                req.body.discountPercentage || 0,
                { allowManualSales }
            );
        } catch (error) {
            if (error?.status === 400) {
                return res.status(400).json({ error: error.message });
            }
            throw error;
        }

        // Validate amount received
        const amountReceivedNum = parseFloat(req.body.amountReceived);
        if (!isFinite(amountReceivedNum) || amountReceivedNum < totals.totalAmount) {
            return res.status(400).json({
                error: `Insufficient payment. Total required: ${totals.totalAmount}`,
                required: totals.totalAmount,
                received: amountReceivedNum
            });
        }

        const changeAmount = parseFloat((amountReceivedNum - totals.totalAmount).toFixed(2));

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

        // Build a sanitized sale data object using COMPUTED totals
        const now = new Date();
        const businessNow = getBusinessTimestampParts(now, config.businessTimeZone);
        const saleDate = req.body.saleDate || businessNow.saleDate;
        const saleTime = req.body.saleTime || businessNow.saleTime;
        const saleData = {
            employeeId: String(req.body.employeeId).trim(),
            items: totals.items.map((item, index) => {
                const sourceItem = req.body.items[index] || {};
                return ({
                itemName: item.itemName,
                sku: item.sku,
                category: item.categoryFromDb || null,
                entryMode: item.entryMode || (item.sku ? 'inventory' : 'manual'),
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.lineTotal,
                discountEligible: !!sourceItem.discountEligible,
                priceFromBarcode: !!sourceItem.priceFromBarcode
            });
            }),
            subTotal: totals.subtotal,
            discountPercentage: totals.discountPercentage,
            discountAmount: totals.discountAmount,
            discount: totals.discountAmount,
            totalAmount: totals.totalAmount,
            amountReceived: amountReceivedNum,
            changeAmount: changeAmount,
            saleDate,
            saleTime,
            itemsCount: totals.items.length,
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
router.get('/analytics/summary', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        const summary = await Sale.aggregate([
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalAmount" },
                    totalDiscounts: { $sum: { $ifNull: ["$discountAmount", "$discount"] } },
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
router.put('/:id', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
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
            { returnDocument: 'after', runValidators: true }
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
