const mongoose = require('mongoose');

const returnSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, trim: true },
    originalSaleId: { type: String, trim: true, index: true },
    receiptId: { type: String, required: [true, 'Receipt ID is required'], trim: true },
    items: [{
        name: { type: String, trim: true },
        price: { type: Number, min: [0, 'Price cannot be negative'] },
        quantity: { type: Number, min: [1, 'Quantity must be at least 1'] },
        returnQty: { type: Number, min: [1, 'Return quantity must be at least 1'] },
        refundAmount: { type: Number, min: [0, 'Refund cannot be negative'] }
    }],
    totalRefund: { type: Number, required: [true, 'Total refund is required'], min: [0, 'Total refund cannot be negative'] },
    reason: { type: String, trim: true },
    cashierId: { type: String, trim: true },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Return', returnSchema);
