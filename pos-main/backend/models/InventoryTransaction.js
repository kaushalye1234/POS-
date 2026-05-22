const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema({
    sku: { type: String, required: true, index: true },
    change: { type: Number, required: true }, // negative for sales, positive for restock/adjust
    quantity: { type: Number, required: true },
    source: { type: String, enum: ['sale', 'return', 'adjustment', 'manual', 'import'], required: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: false },
    userId: { type: String, required: false },
    priceUsed: { type: Number, required: false },
    priceFromBarcode: { type: Boolean, default: false },
    scannedBarcode: { type: String, required: false },
    notes: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
