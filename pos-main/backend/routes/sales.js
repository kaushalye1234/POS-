const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Sale = require('../models/Sale');
const Item = require('../models/Item');
const InventoryTransaction = require('../models/InventoryTransaction');

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
        const saleDate = req.body.saleDate || now.toISOString().slice(0, 10);
        const saleTime = req.body.saleTime || now.toTimeString().split(' ')[0];
        
        let saleDateTime = now;
        try {
            const parsed = new Date(`${saleDate}T${saleTime}`);
            if (!isNaN(parsed.getTime())) {
                saleDateTime = parsed;
            }
        } catch {
            saleDateTime = now;
        }

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
            saleDateTime,
            itemsCount: req.body.items.length,
            customerId: req.body.customerId || null,
            customerName: req.body.customerName || null
        };

        // ============================================
        // ============================================
        // Overhaul: Stock Pre-check + Profitability protection checks
        // ============================================
        const outOfStock = [];
        const invalidDiscounts = [];
        let rule = null;

        const DiscountRule = require('../models/DiscountRule');
        if (req.body.discountRuleId) {
            rule = await DiscountRule.findOne({ id: req.body.discountRuleId });
        }

        const totalReqDiscount = Number(req.body.discount || 0);
        const subTotal = Number(req.body.subTotal || 0);

        if (saleData.items.length > 0) {
            for (const item of saleData.items) {
                if (item.sku) {
                    const dbItem = await Item.findOne({ sku: item.sku });
                    if (!dbItem) {
                        if (useSession) await session.abortTransaction();
                        return res.status(404).json({ error: `Item with SKU ${item.sku} not found.` });
                    }

                    // 1. Stock Pre-check (No negative stock)
                    if (dbItem.stockLevel < item.quantity) {
                        outOfStock.push({
                            sku: item.sku,
                            itemName: dbItem.name,
                            requested: item.quantity,
                            available: dbItem.stockLevel
                        });
                    }

                    // 2. Discount Margin & Profitability Checks
                    if (totalReqDiscount > 0) {
                        let isEligible = true;
                        if (rule) {
                            if (rule.appliesTo && rule.appliesTo !== 'all') {
                                const [applyType, applyVal] = rule.appliesTo.split(':');
                                if (applyType === 'category' && dbItem.category !== applyVal) {
                                    isEligible = false;
                                } else if (applyType === 'sku' && dbItem.sku !== applyVal) {
                                    isEligible = false;
                                }
                            }
                        }

                        if (isEligible) {
                            const itemShare = subTotal > 0 ? (item.totalPrice / subTotal) : 0;
                            const itemDiscount = totalReqDiscount * itemShare;
                            const discountedPrice = item.unitPrice - (itemDiscount / item.quantity);

                            const maxAllowedDiscountVal = dbItem.price * (dbItem.maxDiscountPercent / 100);
                            if (itemDiscount / item.quantity > maxAllowedDiscountVal) {
                                invalidDiscounts.push({
                                    sku: item.sku,
                                    itemName: dbItem.name,
                                    reason: `Discount exceeds maximum allowed limit of ${dbItem.maxDiscountPercent}%.`,
                                    requestedDiscount: itemDiscount / item.quantity,
                                    maxAllowed: maxAllowedDiscountVal
                                });
                            }

                            if (discountedPrice < dbItem.costPrice) {
                                invalidDiscounts.push({
                                    sku: item.sku,
                                    itemName: dbItem.name,
                                    reason: `Discount drops selling price (Rs. ${discountedPrice.toFixed(2)}) below wholesale cost (Rs. ${dbItem.costPrice.toFixed(2)}).`,
                                    requestedDiscount: itemDiscount / item.quantity,
                                    costPrice: dbItem.costPrice
                                });
                            }
                        }
                    }
                }
            }
        }

        // Return stock error
        if (outOfStock.length > 0) {
            if (useSession) await session.abortTransaction();
            return res.status(400).json({
                error: 'No Stock',
                details: outOfStock
            });
        }

        // Return discount violation error
        if (invalidDiscounts.length > 0) {
            if (useSession) await session.abortTransaction();
            return res.status(400).json({
                error: 'Discount Limit Exceeded',
                message: 'Discount violates store profitability protection limits.',
                details: invalidDiscounts
            });
        }

        // Perform stock decrements now that pre-check and validations have passed
        if (saleData.items.length > 0) {
            for (const item of saleData.items) {
                if (item.sku) {
                    const opts = useSession ? { session } : {};
                    const result = await Item.findOneAndUpdate(
                        {
                            sku: item.sku,
                            stockLevel: { $gte: item.quantity } // Double safety check
                        },
                        { $inc: { stockLevel: -item.quantity } },
                        { returnDocument: 'after', ...opts }
                    );

                    if (!result) {
                        if (useSession) await session.abortTransaction();
                        return res.status(400).json({
                            error: 'No Stock',
                            details: [{
                                sku: item.sku,
                                requested: item.quantity,
                                available: 0
                            }]
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
// ============================================
// GET /api/sales/analytics/advanced
// ============================================
router.get('/analytics/advanced', async (req, res, next) => {
    try {
        const Item = require('../models/Item');
        const items = await Item.find().sort({ sku: 1 });
        const sales = await Sale.find();

        const itemMap = {};
        items.forEach(item => {
            itemMap[item.sku] = item;
        });

        // Date Calculations
        const now = new Date();
        const date7DaysAgo = new Date();
        date7DaysAgo.setDate(now.getDate() - 7);
        const date30DaysAgo = new Date();
        date30DaysAgo.setDate(now.getDate() - 30);

        // Financial Variables
        let totalRevenue = 0;
        let totalCost = 0;
        let totalGrossProfit = 0;

        // Performance maps
        const unitsSold7Days = {};
        const unitsSold30Days = {};
        const totalUnitsSold = {};
        const totalItemRevenue = {};
        const totalItemProfit = {};

        // Category map
        const categoryStats = {};

        sales.forEach(sale => {
            const saleDateObj = new Date(sale.saleDateTime || sale.createdAt);
            const in7Days = saleDateObj >= date7DaysAgo;
            const in30Days = saleDateObj >= date30DaysAgo;

            sale.items.forEach(si => {
                const sku = si.sku;
                const qty = si.quantity || 0;
                const revenue = si.totalPrice || 0;

                // Lookup costPrice
                const itemInfo = itemMap[sku] || { costPrice: 0, category: si.category || 'Other', name: si.itemName };
                const cost = (itemInfo.costPrice || 0) * qty;
                const profit = revenue - cost;

                totalRevenue += revenue;
                totalCost += cost;
                totalGrossProfit += profit;

                if (sku) {
                    if (in7Days) {
                        unitsSold7Days[sku] = (unitsSold7Days[sku] || 0) + qty;
                    }
                    if (in30Days) {
                        unitsSold30Days[sku] = (unitsSold30Days[sku] || 0) + qty;
                    }
                    totalUnitsSold[sku] = (totalUnitsSold[sku] || 0) + qty;
                    totalItemRevenue[sku] = (totalItemRevenue[sku] || 0) + revenue;
                    totalItemProfit[sku] = (totalItemProfit[sku] || 0) + profit;
                }

                const cat = si.category || itemInfo.category || 'Other';
                if (!categoryStats[cat]) {
                    categoryStats[cat] = { category: cat, revenue: 0, cost: 0, profit: 0, units: 0 };
                }
                categoryStats[cat].revenue += revenue;
                categoryStats[cat].cost += cost;
                categoryStats[cat].profit += profit;
                categoryStats[cat].units += qty;
            });
        });

        // 30 Days Financials for ITR/DSI
        let cogs30Days = 0;
        let revenue30Days = 0;
        let profit30Days = 0;

        sales.forEach(sale => {
            const saleDateObj = new Date(sale.saleDateTime || sale.createdAt);
            if (saleDateObj >= date30DaysAgo) {
                sale.items.forEach(si => {
                    const sku = si.sku;
                    const qty = si.quantity || 0;
                    const revenue = si.totalPrice || 0;
                    const itemInfo = itemMap[sku] || { costPrice: 0 };
                    const cost = (itemInfo.costPrice || 0) * qty;
                    cogs30Days += cost;
                    revenue30Days += revenue;
                    profit30Days += (revenue - cost);
                });
            }
        });

        // Current Inventory Value
        let currentInventoryValue = 0;
        items.forEach(item => {
            currentInventoryValue += (item.costPrice || 0) * (item.stockLevel || 0);
        });

        const avgInventory = currentInventoryValue || 1;
        const itr = cogs30Days / avgInventory;
        const dsi = itr > 0 ? (avgInventory / cogs30Days) * 30 : 9999;
        const gmroi = profit30Days / avgInventory;

        // Pareto ABC Analysis (based on revenue of items)
        const itemAbc = [];
        items.forEach(item => {
            const rev = totalItemRevenue[item.sku] || 0;
            itemAbc.push({
                sku: item.sku,
                name: item.name,
                category: item.category,
                revenue: rev,
                profit: totalItemProfit[item.sku] || 0,
                units: totalUnitsSold[item.sku] || 0,
                costPrice: item.costPrice || 0,
                price: item.price || 0,
                markup: item.costPrice > 0 ? ((item.price - item.costPrice) / item.costPrice) * 100 : 0,
                margin: item.price > 0 ? ((item.price - item.costPrice) / item.price) * 100 : 0,
                stockLevel: item.stockLevel || 0,
                velocity7: (unitsSold7Days[item.sku] || 0) / 7,
                velocity30: (unitsSold30Days[item.sku] || 0) / 30
            });
        });

        itemAbc.sort((a, b) => b.revenue - a.revenue);
        const overallTotalRevenue = itemAbc.reduce((sum, x) => sum + x.revenue, 0);
        let cumulativeRevenue = 0;

        itemAbc.forEach(x => {
            if (overallTotalRevenue > 0) {
                cumulativeRevenue += x.revenue;
                const cumPercent = (cumulativeRevenue / overallTotalRevenue) * 100;
                if (cumPercent <= 70) {
                    x.abcCategory = 'A';
                } else if (cumPercent <= 90) {
                    x.abcCategory = 'B';
                } else {
                    x.abcCategory = 'C';
                }
            } else {
                x.abcCategory = 'C';
            }
        });

        // Alerts list
        const lowStockAlerts = [];
        const criticalRestockAlerts = [];

        items.forEach(item => {
            const stock = item.stockLevel || 0;
            const lowThresh = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 10;
            const critThresh = item.criticalStockThreshold !== undefined ? item.criticalStockThreshold : 3;

            if (stock <= critThresh) {
                criticalRestockAlerts.push({
                    sku: item.sku,
                    name: item.name,
                    stockLevel: stock,
                    threshold: critThresh,
                    category: item.category
                });
            } else if (stock <= lowThresh) {
                lowStockAlerts.push({
                    sku: item.sku,
                    name: item.name,
                    stockLevel: stock,
                    threshold: lowThresh,
                    category: item.category
                });
            }
        });

        res.json({
            financials: {
                totalRevenue,
                totalCost,
                totalGrossProfit,
                netProfitMargin: totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0,
                revenue30Days,
                cogs30Days,
                profit30Days
            },
            inventoryMetrics: {
                currentInventoryValue,
                itr,
                dsi,
                gmroi
            },
            categories: Object.values(categoryStats),
            items: itemAbc,
            alerts: {
                lowStock: lowStockAlerts,
                criticalRestock: criticalRestockAlerts
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/sales/analytics/summary
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

module.exports = router;
