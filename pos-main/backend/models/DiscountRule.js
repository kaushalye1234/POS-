const mongoose = require('mongoose');

const discountRuleSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: [true, 'Rule name is required'], trim: true },
    type: {
        type: String,
        enum: { values: ['percentage', 'fixed', 'bogo'], message: 'Type must be percentage, fixed, or bogo' },
        required: true
    },
    valueType: {
        type: String,
        enum: { values: ['fixed', 'range'], message: 'valueType must be fixed or range' },
        default: 'fixed'
    },
    value: { type: Number, default: 0, min: [0, 'Value cannot be negative'] },
    valueMin: { type: Number, default: 0, min: [0, 'valueMin cannot be negative'] },
    valueMax: { type: Number, default: 0, min: [0, 'valueMax cannot be negative'] },
    appliesTo: { type: String, default: 'all', trim: true },
    minPurchase: { type: Number, default: 0, min: [0, 'minPurchase cannot be negative'] },
    startDate: { type: String, default: '', trim: true },
    endDate: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DiscountRule', discountRuleSchema);
