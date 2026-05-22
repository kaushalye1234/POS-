// ============================================
// SKU Generator Utility for Fashion Shaa POS
// ============================================
// Generates unique, human-readable SKU codes
// Format: FS-[CATEGORY]-[TIMESTAMP]-[RANDOM]
// Example: FS-DEN-1703-A7X2

const CATEGORY_CODES = {
    'SKIRT': 'SKR',
    'BLOUSE': 'BLS',
    'T-SHIRT': 'TSH',
    'FROCK': 'FRK',
    'DENIM': 'DEN',
    'SHIRT': 'SHT',
    'SHORT': 'SHO',
    'SARAM': 'SAR',
    'CHEETHA': 'CHE',
    'LEGIN': 'LEG',
    'BOTTOM': 'BTM',
    'BRA': 'BRA',
    'BED SHEET': 'BDS',
    'UNDER WEAR': 'UDW',
    'UNDER SKIRT': 'UDS',
    'PANTY': 'PNT',
    'TOWEL': 'TWL',
    'NIGHTY': 'NGT',
    'SKINNER': 'SKN',
    'BABY ITEM': 'BBY',
    'LUNGI': 'LNG',
    'TIGHT FIT': 'TGF',
    'CULOTTES': 'CUL',
    'CUT PIECE': 'CTP',
    'UMBRELLA': 'UMB',
    'BELT': 'BLT',
    'OTHER': 'OTH'
};

/**
 * Generate a unique SKU code
 * @param {string} categoryName - The item category name (e.g. "DENIM")
 * @param {number} sequenceNum - Optional sequence number
 * @returns {string} Generated SKU
 */
function generateSKU(categoryName, sequenceNum = null) {
    const catCode = CATEGORY_CODES[categoryName.toUpperCase()] || 'GEN';
    const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const seq = sequenceNum ? `-${String(sequenceNum).padStart(3, '0')}` : '';
    
    return `FS-${catCode}-${timestamp}${seq}-${random}`;
}

/**
 * Generate a barcode-compatible EAN-8 style code
 * @returns {string} 8-digit barcode number
 */
function generateBarcode() {
    const base = Date.now().toString().slice(-7);
    const checkDigit = base.split('').reduce((sum, d) => sum + parseInt(d), 0) % 10;
    return base + checkDigit;
}

module.exports = { generateSKU, generateBarcode, CATEGORY_CODES };
