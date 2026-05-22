/**
 * Enhanced barcode parser utility
 * - Supports delimiter-based SKU|PRICE formats
 * - Parses GS1 application identifiers (basic support for (01)GTIN and (392n)/(393n) price AIs)
 * - Falls back to GTIN/EAN/UPC detection or raw SKU
 */

function parseGS1Sequence(code) {
    // Extract all AI segments like (01)12345(3922)00001234
    const regex = /\((\d{2,4})\)([^()]+)/g;
    const segments = {};
    let m;
    while ((m = regex.exec(code)) !== null) {
        segments[m[1]] = m[2];
    }
    return segments;
}

function parseBarcode(code) {
    if (!code || typeof code !== 'string') return null;
    const normalized = code.trim();

    // 1) Simple delimiter-based price encoding: SKU|PRICE or SKU:PRICE
    const sepMatch = normalized.match(/(.+)[|:\\](\d+(?:\.\d{1,2})?)$/);
    if (sepMatch) {
        return { type: 'delimited-price', sku: sepMatch[1], price: parseFloat(sepMatch[2]) };
    }

    // 2) GS1 parenthesis format parsing
    if (normalized.includes('(') && normalized.includes(')')) {
        const segs = parseGS1Sequence(normalized);
        // GTIN
        const gtin = segs['01'] || null;

        // AI 392n: price with implied decimals where 'n' is decimal count
        // AI key in segments will be like '392' + decimal digit(s). We'll search keys starting with '392' or '393'
        for (const key of Object.keys(segs)) {
            if (key.startsWith('392')) {
                // key e.g., '3922' -> decimals = last digit
                const decimals = parseInt(key.slice(3), 10) || 0;
                const raw = segs[key];
                const price = parseInt(raw, 10) / Math.pow(10, decimals);
                return { type: 'gs1', sku: gtin, price, ai: key };
            }
            if (key.startsWith('393')) {
                // 393 includes 3-digit currency code then price digits
                const decimals = parseInt(key.slice(3), 10) || 0;
                const raw = segs[key];
                const currency = raw.slice(0, 3);
                const priceRaw = raw.slice(3);
                const price = parseInt(priceRaw || '0', 10) / Math.pow(10, decimals);
                return { type: 'gs1', sku: gtin, price, currency, ai: key };
            }
        }
    }

    // 3) If looks like EAN/UPC/GTIN (all digits, length 8-14), treat as sku
    const digitsOnly = normalized.replace(/\D/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 14 && digitsOnly === normalized) {
        return { type: 'gtin', sku: normalized };
    }

    // 4) Fallback: return raw as sku
    return { type: 'raw', sku: normalized };
}

module.exports = { parseBarcode };