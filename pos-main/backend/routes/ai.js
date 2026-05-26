const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Employee = require('../models/Employee');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function getGeminiModel(model = 'gemini-2.0-flash') {
    if (!String(process.env.GEMINI_API_KEY || '').trim()) {
        const error = new Error('Gemini API key is not configured on the server.');
        error.status = 503;
        throw error;
    }

    return genAI.getGenerativeModel({ model });
}

function formatCurrency(value) {
    return `Rs.${Number(value || 0).toFixed(2)}`;
}

function buildDiscountFallback({ context, currentRules = [], salesSummary = null, topCategories = [] }) {
    const activeRuleNames = currentRules
        .filter((rule) => rule && rule.active)
        .map((rule) => rule.name)
        .filter(Boolean);
    const topCategory = topCategories[0]?._id || 'All Items';
    const avgSaleValue = Number(salesSummary?.averageSaleValue || 0);
    const threshold = avgSaleValue > 0
        ? Math.max(500, Math.round(avgSaleValue / 500) * 500)
        : 2500;

    const scenarioSpecific = {
        general: [
            `**Category Booster**\n* Run a 10% discount on ${topCategory} for 3 days to lift movement in your strongest area.`,
            `**Basket Builder**\n* Offer Rs.500 off purchases above ${formatCurrency(threshold)} to increase average bill size.`,
            `**Repeat Customer Push**\n* Give loyalty customers an extra 5% off on their next visit within 7 days.`
        ],
        slow_season: [
            `**Quiet Hours Flash Sale**\n* Offer 12% off storewide during slow hours to create urgency and bring in walk-ins.`,
            `**Doorbuster Category Deal**\n* Use 15% off ${topCategory} for a short 2-day campaign to restart traffic.`,
            `**Spend and Save**\n* Give Rs.750 off bills above ${formatCurrency(threshold + 1000)} to protect margin while driving bigger purchases.`
        ],
        new_stock: [
            `**Aging Stock Clearance**\n* Mark slow-moving items with 15% to 20% off and keep the promotion time-boxed to one week.`,
            `**Bundle Clearance Offer**\n* Buy any 2 selected clearance items and get the cheaper one at 50% off.`,
            `**Tiered Markdown**\n* Start with 10% off for 3 days, then raise to 15% if stock is still heavy.`
        ],
        loyalty: [
            `**VIP Return Offer**\n* Give repeat customers 10% off their next purchase within 7 days.`,
            `**Points Booster Day**\n* Double loyalty points on ${topCategory} for one day each week.`,
            `**Member Threshold Reward**\n* Offer Rs.500 off when loyal customers spend above ${formatCurrency(threshold)}.`
        ],
        competitor: [
            `**Competitive Match Offer**\n* Use a targeted 8% to 10% discount on ${topCategory} instead of a full storewide markdown.`,
            `**Bundle Value Campaign**\n* Offer a 2-item bundle at a visible value price to compete on perceived savings.`,
            `**Retention Voucher**\n* Print a next-visit coupon for Rs.500 off valid within 7 days for customers who buy today.`
        ],
        holiday: [
            `**Festival Spotlight Sale**\n* Run 12% off on holiday-relevant categories like ${topCategory} for the event window.`,
            `**Gift Basket Offer**\n* Offer Rs.750 off purchases above ${formatCurrency(threshold + 1500)} to push gifting baskets.`,
            `**Limited-Time Loyalty Bonus**\n* Give returning customers an extra 5% festive bonus valid for the holiday week.`
        ]
    };

    const recommendations = scenarioSpecific[context] || scenarioSpecific.general;
    const existingRuleNote = activeRuleNames.length
        ? `Current active rules: ${activeRuleNames.join(', ')}.`
        : 'There are no active discount rules right now.';

    return `**Backend Promotion Summary**\nRecent sales average is ${formatCurrency(avgSaleValue)} and your strongest category is ${topCategory}. ${existingRuleNote}\n\n${recommendations.join('\n\n')}\n\n**Note**\n* Gemini is currently unavailable, so these suggestions were generated from your POS sales data and current rule set.`;
}

// ============================================
// POST /api/ai/sales-analysis
// Deep AI analysis of sales data
// ============================================
router.post('/sales-analysis', async (req, res, next) => {
    try {
        const { period } = req.body; // 'today', 'week', 'month', 'year'
        
        // Calculate date range
        const now = new Date();
        let startDate;
        switch (period) {
            case 'today':
                startDate = now.toISOString().split('T')[0];
                break;
            case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(weekAgo.getDate() - 7);
                startDate = weekAgo.toISOString().split('T')[0];
                break;
            case 'month':
                const monthAgo = new Date(now);
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                startDate = monthAgo.toISOString().split('T')[0];
                break;
            case 'year':
                startDate = `${now.getFullYear()}-01-01`;
                break;
            default:
                startDate = '2020-01-01'; // All time
        }
        
        const endDate = now.toISOString().split('T')[0];

        // Aggregate sales data for the AI
        const salesData = await Sale.aggregate([
            { $match: { saleDate: { $gte: startDate, $lte: endDate } } },
            {
                $group: {
                    _id: "$saleDate",
                    totalRevenue: { $sum: "$totalAmount" },
                    totalDiscount: { $sum: { $ifNull: ["$discountAmount", "$discount"] } },
                    salesCount: { $sum: 1 },
                    itemsSold: { $sum: "$itemsCount" },
                    avgSaleValue: { $avg: "$totalAmount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Top items aggregation
        const topItems = await Sale.aggregate([
            { $match: { saleDate: { $gte: startDate, $lte: endDate } } },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.itemName",
                    totalQty: { $sum: "$items.quantity" },
                    totalRevenue: { $sum: "$items.totalPrice" }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 }
        ]);

        // Send to Gemini for deep analysis
        const model = getGeminiModel('gemini-2.0-flash');

        const prompt = `You are a senior retail business analyst AI for "Fashion Shaa", a clothing store in Sri Lanka. Analyze the following POS sales data and provide actionable insights.

SALES DATA (${period || 'all time'}):
${JSON.stringify(salesData, null, 2)}

TOP SELLING ITEMS:
${JSON.stringify(topItems, null, 2)}

Provide your analysis in this JSON format:
{
  "summary": "Brief 2-line summary of overall performance",
  "peakDays": ["List of best performing days"],
  "slowDays": ["List of underperforming days"],
  "recommendations": ["3-5 actionable business recommendations"],
  "topProducts": ["Top 3 products with insights"],
  "predictedTrend": "Brief prediction for next period",
  "optimizedHours": "Suggested optimal store hours based on data"
}

Respond ONLY with the JSON object, no markdown formatting.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Try to parse JSON from the response
        let aiAnalysis;
        try {
            aiAnalysis = JSON.parse(responseText);
        } catch {
            aiAnalysis = { summary: responseText, rawResponse: true };
        }

        res.json({
            period,
            rawData: { salesData, topItems },
            aiAnalysis
        });

    } catch (err) {
        console.error('AI Sales Analysis Error:', err);
        res.status(500).json({ error: 'AI analysis failed', details: err.message });
    }
});

// ============================================
// POST /api/ai/employee-performance
// AI-powered employee performance review with Sinhala support
// ============================================
router.post('/employee-performance', async (req, res, next) => {
    try {
        const { language } = req.body; // 'en' or 'si' (Sinhala)
        
        // Get all employees
        const employees = await Employee.find();
        
        // Get sales per employee
        const employeeSales = await Sale.aggregate([
            {
                $group: {
                    _id: "$employeeId",
                    totalRevenue: { $sum: "$totalAmount" },
                    salesCount: { $sum: 1 },
                    avgSaleValue: { $avg: "$totalAmount" },
                    totalItems: { $sum: "$itemsCount" },
                    totalDiscount: { $sum: { $ifNull: ["$discountAmount", "$discount"] } }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // Map employee names
        const performanceData = employeeSales.map(es => {
            const emp = employees.find(e => e.empId === es._id);
            return {
                employeeId: es._id,
                employeeName: emp ? emp.name : 'Unknown',
                role: emp ? emp.role : 'unknown',
                ...es
            };
        });

        // Build Gemini prompt
        const model = getGeminiModel('gemini-2.0-flash');

        const langInstruction = language === 'si' 
            ? 'Respond ENTIRELY in Sinhala (සිංහල). Use Sinhala Unicode characters throughout.'
            : 'Respond in English.';

        const prompt = `You are an HR performance analyst AI for "Fashion Shaa" clothing store in Sri Lanka. ${langInstruction}

EMPLOYEE PERFORMANCE DATA:
${JSON.stringify(performanceData, null, 2)}

Analyze each employee's performance and provide:
1. Individual performance rating (out of 5 stars)
2. Strengths
3. Areas of improvement
4. Specific actionable recommendation for management
5. Bonus/incentive suggestion

Respond in this JSON format:
{
  "overallTeamScore": "X/5",
  "teamSummary": "Brief team performance overview",
  "employees": [
    {
      "id": "E1",
      "name": "...",
      "rating": "X/5",
      "strengths": "...",
      "improvements": "...",
      "recommendation": "...",
      "bonusSuggestion": "..."
    }
  ]
}

Respond ONLY with the JSON object, no markdown formatting.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        let aiPerformance;
        try {
            aiPerformance = JSON.parse(responseText);
        } catch {
            aiPerformance = { teamSummary: responseText, rawResponse: true };
        }

        res.json({
            language: language || 'en',
            rawData: performanceData,
            aiPerformance
        });

    } catch (err) {
        console.error('AI Employee Performance Error:', err);
        res.status(500).json({ error: 'AI performance analysis failed', details: err.message });
    }
});

// ============================================
// POST /api/ai/discount-advice
// AI-powered discount suggestions using server-side Gemini config
// ============================================
router.post('/discount-advice', async (req, res) => {
    try {
        const { context = 'general', currentRules = [] } = req.body || {};
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        const endDate = now.toISOString().split('T')[0];

        const [salesSummary] = await Sale.aggregate([
            { $match: { saleDate: { $gte: startDate, $lte: endDate } } },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalDiscount: { $sum: { $ifNull: ["$discountAmount", "$discount"] } },
                    salesCount: { $sum: 1 },
                    itemsSold: { $sum: '$itemsCount' },
                    averageSaleValue: { $avg: '$totalAmount' }
                }
            }
        ]);

        const topCategories = await Sale.aggregate([
            { $match: { saleDate: { $gte: startDate, $lte: endDate } } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: { $ifNull: ['$items.category', 'Uncategorized'] },
                    revenue: { $sum: '$items.totalPrice' },
                    quantity: { $sum: '$items.quantity' }
                }
            },
            { $sort: { revenue: -1 } },
            { $limit: 5 }
        ]);

        const scenarioPrompts = {
            general: 'Suggest 3 practical promotions to increase normal day-to-day revenue.',
            slow_season: 'Foot traffic is slow. Suggest 3 promotions to bring customers into the store quickly.',
            new_stock: 'Old stock needs to move. Suggest 3 promotions that help clear stale inventory without hurting the brand.',
            loyalty: 'Suggest 3 promotions to reward repeat customers and grow loyalty.',
            competitor: 'A nearby competitor is pressuring prices. Suggest 3 smart promotions to stay competitive without unnecessary margin loss.',
            holiday: 'A holiday or special event is coming. Suggest 3 themed promotions suitable for a clothing retailer.'
        };

        const prompt = `You are the retail promotions advisor for Fashion Shaa, a clothing store in Sri Lanka.

Recent 30-day sales summary:
${JSON.stringify(salesSummary || {
            totalRevenue: 0,
            totalDiscount: 0,
            salesCount: 0,
            itemsSold: 0,
            averageSaleValue: 0
        }, null, 2)}

Top categories:
${JSON.stringify(topCategories, null, 2)}

Current discount rules:
${JSON.stringify(Array.isArray(currentRules) ? currentRules : [], null, 2)}

Scenario:
${scenarioPrompts[context] || scenarioPrompts.general}

Write:
1. A short summary paragraph.
2. Three actionable discount ideas for this store.
3. For each idea, include name, type, target products/customers, and a realistic discount level.

Use simple readable text with bold headings and bullet points.
Do not use markdown code fences.`;

        let analysis = '';
        let fallback = false;

        try {
            const model = getGeminiModel('gemini-2.0-flash');
            const result = await model.generateContent(prompt);
            analysis = result.response.text().trim();
        } catch (aiError) {
            console.warn('Gemini discount advice unavailable, using fallback suggestions:', aiError.message);
            analysis = buildDiscountFallback({ context, currentRules, salesSummary, topCategories });
            fallback = true;
        }

        res.json({
            context,
            analysis,
            fallback,
            salesSummary: salesSummary || null,
            topCategories
        });
    } catch (err) {
        console.error('AI Discount Advice Error:', err);
        res.status(err.status || 500).json({
            error: 'AI discount advice failed',
            details: err.message
        });
    }
});

module.exports = router;
