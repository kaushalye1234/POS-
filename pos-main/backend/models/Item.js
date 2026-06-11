const mongoose = require('mongoose');

// DB-001: Schema validation with min/trim/enum constraints
const itemSchema = new mongoose.Schema({
    sku: {
        type: String,
        required: [true, 'SKU is required'],
        unique: true,
        trim: true,
        index: true
    },
    barcode: {
        type: String,
        index: true,
        unique: true,
        sparse: true,
        trim: true,
        default: null
    },
    name: {
        type: String,
        required: [true, 'Item name is required'],
        trim: true,
        maxlength: [200, 'Item name cannot exceed 200 characters']
    },
    category: {
        type: String,
        trim: true,
        default: 'Other'
    },
    size: {
        type: String,
        trim: true,
        default: ''
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative'],
        default: 0
    },
    costPrice: {
        type: Number,
        required: [true, 'Cost price is required'],
        min: [0, 'Cost price cannot be negative'],
        default: 0
    },
    maxDiscountPercent: {
        type: Number,
        required: [true, 'Max discount percent is required'],
        min: [0, 'Max discount percent cannot be negative'],
        max: [100, 'Max discount percent cannot exceed 100%'],
        default: 30
    },
    stockLevel: {
        type: Number,
        min: [0, 'Stock level cannot be negative'],
        default: 0
    },
    imageUrl: {
        type: String,
        default: ''
    },
    lowStockThreshold: {
        type: Number,
        default: 10,
        min: [0, 'Threshold cannot be negative']
    },
    criticalStockThreshold: {
        type: Number,
        default: 3,
        min: [0, 'Threshold cannot be negative']
    },
    storedAt: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Item', itemSchema);
