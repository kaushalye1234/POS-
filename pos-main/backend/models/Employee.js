const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    empId: {
        type: String, // e.g. "E1"
        required: [true, 'Employee ID is required'],
        unique: true,
        trim: true,
        match: [/^E\d+$/, 'Employee ID must be in format E1, E2, E3, etc.']
    },
    name: {
        type: String,
        required: [true, 'Employee name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    phone: {
        type: String,
        default: '',
        trim: true
    },
    role: {
        type: String,
        default: 'cashier',
        enum: {
            values: ['manager', 'cashier', 'admin', 'salesman'],
            message: 'Role must be one of: manager, cashier, admin, salesman'
        }
    },
    baseSalary: {
        type: Number,
        default: 0,
        min: [0, 'Base salary cannot be negative']
    },
    workingDaysPerMonth: {
        type: Number,
        default: 26,
        min: [1, 'Working days per month must be at least 1']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Employee', employeeSchema);
