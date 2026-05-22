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
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative'],
        default: 0
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
