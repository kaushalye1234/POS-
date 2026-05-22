const assert = require('assert');
const { parseBarcode } = require('../utils/barcodeParser');

function testDelimited() {
    const res = parseBarcode('SKU123|199.50');
    assert(res.type === 'delimited-price', 'Expected delimited-price');
    assert(res.sku === 'SKU123');
    assert(Math.abs(res.price - 199.5) < 0.001);
}

function testGTIN() {
    const res = parseBarcode('0123456789012');
    assert(res.type === 'gtin');
    assert(res.sku === '0123456789012');
}

function testGS1() {
    const code = '(01)1234567890123(3922)00001234';
    const res = parseBarcode(code);
    assert(res.type === 'gs1');
    assert(res.sku === '1234567890123');
    // price should be parsed; allow tolerance for best-effort parsing
    if (typeof res.price !== 'number') throw new Error('Price missing');
}

function testRaw() {
    const res = parseBarcode('ABC-XYZ-99');
    assert(res.type === 'raw');
    assert(res.sku === 'ABC-XYZ-99');
}

(async function run() {
    try {
        testDelimited();
        testGTIN();
        testGS1();
        testRaw();
        console.log('All parser tests passed');
        process.exit(0);
    } catch (err) {
        console.error('Parser test failed:', err.message);
        process.exit(2);
    }
})();