const mongoose = require('mongoose');

// DB-001: Schema validation with min/trim constraints
const saleItemSchema = new mongoose.Schema({
    sku: { type: String, required: false, trim: true },
    itemName: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    quantity: { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
    unitPrice: { type: Number, required: true, min: [0, 'Price cannot be negative'] },
    totalPrice: { type: Number, required: true, min: [0, 'Total cannot be negative'] },
    discountEligible: { type: Boolean, default: false },
    priceFromBarcode: { type: Boolean, default: false }
});

const saleSchema = new mongoose.Schema({
    employeeId: {
        type: String,
        required: [true, 'Employee ID is required'],
        trim: true,
        index: true
    },
    totalAmount: {
        type: Number,
        required: [true, 'Total amount is required'],
        min: [0, 'Total cannot be negative']
    },
    subTotal: {
        type: Number,
        required: true,
        min: [0, 'Subtotal cannot be negative']
    },
    discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative']
    },
    amountReceived: {
        type: Number,
        required: [true, 'Amount received is required'],
        min: [0, 'Amount received cannot be negative']
    },
    changeAmount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        default: 'CASH',
        trim: true
    },
    status: {
        type: String,
        default: 'completed',
        enum: ['completed', 'voided', 'refunded']
    },
    itemsCount: {
        type: Number,
        required: true,
        min: [1, 'Must have at least 1 item']
    },
    saleDate: {
        type: String,
        required: [true, 'Sale date is required'],
        trim: true,
        index: true
    },
    saleTime: {
        type: String,
        required: true,
        trim: true
    },
    customerId: {
        type: String,
        default: null,
        trim: true
    },
    customerName: {
        type: String,
        default: null,
        trim: true
    },
    notes: {
        type: String,
        default: '',
        trim: true,
        maxlength: [1000, 'Notes cannot exceed 1000 characters']
    },
    items: [saleItemSchema],
    createdAt: { type: Date, default: Date.now }
});

// DB-002: Compound indexes for fast lookups
saleSchema.index({ saleDate: 1, employeeId: 1 });
saleSchema.index({ createdAt: -1 }); // Recent sales queries

module.exports = mongoose.model('Sale', saleSchema);
