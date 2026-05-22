const mongoose = require('mongoose');

// DB-001: Schema validation + DB-002: indexes for phone lookups
const customerSchema = new mongoose.Schema({
    id: {
        type: String,
        required: [true, 'Customer ID is required'],
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
        index: true  // DB-002: Phone lookup index
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    address: {
        type: String,
        trim: true
    },
    birthday: {
        type: String,
        trim: true
    },
    points: {
        type: Number,
        default: 0,
        min: [0, 'Points cannot be negative']
    },
    notes: {
        type: String,
        trim: true
    },
    lastVisit: {
        type: String,
        trim: true
    },
    photoBase64: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Customer', customerSchema);
