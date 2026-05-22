const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Employee = require('../models/Employee');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
                    totalDiscount: { $sum: "$discount" },
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
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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
                    totalDiscount: { $sum: "$discount" }
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
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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

module.exports = router;
