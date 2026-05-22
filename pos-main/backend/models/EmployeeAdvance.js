const mongoose = require('mongoose');

const employeeAdvanceSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, trim: true },
    employeeId: { type: String, required: [true, 'Employee ID is required'], trim: true, index: true },
    amount: { type: Number, required: [true, 'Amount is required'], min: [0, 'Amount cannot be negative'] },
    type: {
        type: String,
        enum: { values: ['cash', 'goods'], message: 'Type must be cash or goods' },
        required: [true, 'Advance type is required']
    },
    date: { type: String, trim: true },
    reason: { type: String, trim: true },
    status: {
        type: String,
        enum: { values: ['pending', 'deducted'], message: 'Status must be pending or deducted' },
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EmployeeAdvance', employeeAdvanceSchema);
