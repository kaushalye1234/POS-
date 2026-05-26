const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const Sale = require('../models/Sale');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticateToken, authorize } = require('../middleware/auth');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================
// POST /api/ai/restock-prediction
// FIXED: Add authentication and authorization
// AI-powered restock intelligence using SKU data
// ============================================
router.post('/restock-prediction', authenticateToken, authorize('admin', 'manager'), async (req, res, next) => {
    try {
        // Get current inventory levels
        const inventory = await Item.find().lean();
        
        // Get sales velocity per SKU (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

        const salesVelocity = await Sale.aggregate([
            { $match: { saleDate: { $gte: dateStr } } },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.sku",
                    itemName: { $first: "$items.itemName" },
                    totalSold: { $sum: "$items.quantity" },
                    avgDailyDemand: { $avg: "$items.quantity" },
                    totalRevenue: { $sum: "$items.totalPrice" }
                }
            },
            { $sort: { totalSold: -1 } }
        ]);

        // Merge inventory with sales data
        const restockData = inventory.map(item => {
            const velocity = salesVelocity.find(v => v._id === item.sku);
            const dailyDemand = velocity ? velocity.avgDailyDemand : 0;
            const daysOfStock = dailyDemand > 0 ? Math.floor(item.stockLevel / dailyDemand) : 999;
            
            return {
                sku: item.sku,
                name: item.name,
                category: item.category,
                currentStock: item.stockLevel,
                totalSold30Days: velocity ? velocity.totalSold : 0,
                avgDailyDemand: Math.round(dailyDemand * 100) / 100,
                daysOfStockRemaining: daysOfStock,
                revenue30Days: velocity ? velocity.totalRevenue : 0,
                urgency: daysOfStock < 3 ? 'CRITICAL' : daysOfStock < 7 ? 'HIGH' : daysOfStock < 14 ? 'MEDIUM' : 'LOW'
            };
        });

        // Sort by urgency
        restockData.sort((a, b) => {
            const urgencyOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
            return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        });

        // AI analysis for seasonal predictions
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `You are a supply chain AI for "Fashion Shaa" clothing store in Sri Lanka. Analyze this inventory and sales velocity data to predict which items need restocking and any seasonal trends.

INVENTORY & SALES DATA (Last 30 Days):
${JSON.stringify(restockData.slice(0, 20), null, 2)}

Consider Sri Lankan seasonal patterns (Sinhala & Tamil New Year in April, Christmas, Monsoon seasons).

Provide your analysis in JSON format:
{
  "criticalRestocks": [{"sku": "...", "name": "...", "suggestedOrderQty": 0, "reason": "..."}],
  "seasonalAlert": "Any upcoming seasonal demand changes",
  "overstock": ["Items that might be overstocked"],
  "recommendations": ["3-5 supply chain recommendations"]
}

Respond ONLY with the JSON object.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        let aiPrediction;
        try {
            aiPrediction = JSON.parse(responseText);
        } catch {
            aiPrediction = { seasonalAlert: responseText, rawResponse: true };
        }

        res.json({
            restockData,
            aiPrediction
        });

    } catch (err) {
        console.error('AI Restock Prediction Error:', err);
        res.status(500).json({ error: 'Restock prediction failed', details: err.message });
    }
});

module.exports = router;
