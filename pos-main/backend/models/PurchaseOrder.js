const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    supplierId: { type: String, required: true },
    orderDate: { type: String },
    expectedDate: { type: String },
    notes: { type: String },
    items: [{
        itemClass: String,
        quantity: Number,
        costPrice: Number,
        total: Number
    }],
    totalAmount: { type: Number },
    status: { type: String, enum: ['pending', 'ordered', 'received', 'cancelled'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
