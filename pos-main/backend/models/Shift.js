const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, trim: true },
    employeeId: { type: String, required: [true, 'Employee ID is required'], trim: true, index: true },
    employeeName: { type: String, trim: true },
    openTime: { type: Date, required: [true, 'Open time is required'] },
    closeTime: { type: Date },
    startingCash: { type: Number, required: [true, 'Starting cash is required'], min: [0, 'Starting cash cannot be negative'] },
    expectedCash: { type: Number },
    actualCash: { type: Number },
    discrepancy: { type: Number },
    note: { type: String, trim: true },
    status: {
        type: String,
        enum: { values: ['open', 'closed'], message: 'Status must be open or closed' },
        default: 'open',
        index: true
    }
});

module.exports = mongoose.model('Shift', shiftSchema);
