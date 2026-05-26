const mongoose = require('mongoose');

const POS_SETTINGS_KEY = 'pos-settings';
const SALE_ENTRY_MODES = ['inventory_only', 'manual_allowed'];

const posSettingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: POS_SETTINGS_KEY,
        trim: true
    },
    saleEntryMode: {
        type: String,
        enum: SALE_ENTRY_MODES,
        default: 'manual_allowed',
        trim: true
    },
    updatedBy: {
        type: String,
        default: null,
        trim: true
    }
}, {
    timestamps: true
});

posSettingsSchema.statics.getCurrent = async function getCurrent() {
    return this.findOneAndUpdate(
        { key: POS_SETTINGS_KEY },
        { $setOnInsert: { key: POS_SETTINGS_KEY } },
        {
            returnDocument: 'after',
            upsert: true,
            setDefaultsOnInsert: true
        }
    );
};

posSettingsSchema.statics.getSaleEntryModes = function getSaleEntryModes() {
    return [...SALE_ENTRY_MODES];
};

module.exports = mongoose.model('PosSettings', posSettingsSchema);
