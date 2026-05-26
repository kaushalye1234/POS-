const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 30
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    role: {
        type: String,
        enum: ['admin', 'manager', 'cashier'],
        default: 'cashier'
    },
    pin: {
        type: String, // Numeric PIN, stored as string/hash
        minlength: 4,
        maxlength: 60, // Accommodates hashed string
        default: null
    },
    employeeId: {
        type: String, // Links to Employee.empId (e.g. "E1")
        default: null,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password and pin before saving
userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
    }
    if (this.isModified('pin') && this.pin) {
        const salt = await bcrypt.genSalt(12);
        this.pin = await bcrypt.hash(this.pin, salt);
    }
    if (typeof next === 'function') next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Compare PIN method
userSchema.methods.comparePin = async function(candidatePin) {
    if (!this.pin) return false;
    return bcrypt.compare(candidatePin, this.pin);
};

// Remove password and pin from JSON output
userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.pin;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
