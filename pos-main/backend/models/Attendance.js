const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    employeeId: {
        type: String,
        required: [true, 'Employee ID is required'],
        trim: true,
        index: true
    },
    employeeName: {
        type: String,
        trim: true,
        default: ''
    },
    date: {
        type: String,
        required: [true, 'Attendance date is required'],
        trim: true,
        match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
        index: true
    },
    status: {
        type: String,
        enum: {
            values: ['present', 'half-day', 'absent', 'leave'],
            message: 'Status must be present, half-day, absent, or leave'
        },
        default: 'present'
    },
    note: {
        type: String,
        trim: true,
        default: ''
    },
    markedBy: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
