const Item = require('../models/Item');
const InventoryTransaction = require('../models/InventoryTransaction');
const { generateSKU } = require('../utils/skuGenerator');

// Very small CSV parser supporting quoted fields and commas
function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return { headers: [], rows: [] };
    const parseLine = (line) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
                else inQuotes = !inQuotes;
                continue;
            }
            if (ch === ',' && !inQuotes) { result.push(cur); cur = ''; continue; }
            cur += ch;
        }
        result.push(cur);
        return result.map(s => s.trim());
    };

    const headers = parseLine(lines[0]).map(h => h.toLowerCase());
    const rows = lines.slice(1).map(l => {
        const vals = parseLine(l);
        const obj = {};
        for (let i = 0; i < headers.length; i++) {
            obj[headers[i]] = vals[i] !== undefined ? vals[i] : '';
        }
        return obj;
    });
    return { headers, rows };
}

async function importItemsFromCSV(csvText, session = null) {
    const { headers, rows } = parseCSV(csvText);
    const results = { created: 0, updated: 0, errors: [] };

    for (const [idx, row] of rows.entries()) {
        try {
            // Accept headers: sku, name, price, stocklevel, category, storedat
            let sku = (row.sku || '').toString().trim();
            const barcode = (row.barcode || '').toString().trim();
            const name = (row.name || '').toString().trim();
            const price = row.price !== undefined && row.price !== '' ? parseFloat(row.price) : 0;
            const stockLevel = row.stocklevel !== undefined && row.stocklevel !== '' ? parseInt(row.stocklevel, 10) : 0;
            const category = (row.category || '').toString().trim() || 'General';

            const storedAtRaw = (row.storedat ?? row.stored_date ?? row.storeddate ?? '').toString().trim();
            const storedAt = storedAtRaw ? new Date(storedAtRaw) : null;
            const storedAtValid = storedAt && !Number.isNaN(storedAt.getTime());

            if (!name && !sku && !barcode) {
                results.errors.push({ row: idx+2, error: 'Missing name and sku/barcode' });
                continue;
            }

            // If barcode provided and an existing item has that barcode, prefer updating that item
            if (barcode) {
                const existingByBarcode = await Item.findOne({ barcode }).exec();
                if (existingByBarcode) {
                    sku = existingByBarcode.sku;
                }
            }

            if (!sku) {
                sku = generateSKU(category || name).replace(/[^A-Z0-9\-]/gi, '').slice(0, 32);
            }

            const query = { sku };
            const update = { $set: { name, price: isNaN(price) ? 0 : price, category } };
            if (barcode) update.$set.barcode = barcode;
            if (storedAtValid) update.$set.storedAt = storedAt;
            const opts = { upsert: true, returnDocument: 'after' };

            let doc;
            if (session) {
                doc = await Item.findOneAndUpdate(query, update, { session, upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
            } else {
                doc = await Item.findOneAndUpdate(query, update, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
            }

            // Update stockLevel if provided (set absolute)
            if (!isNaN(stockLevel)) {
                if (session) {
                    await Item.updateOne({ sku }, { $set: { stockLevel } }, { session });
                } else {
                    await Item.updateOne({ sku }, { $set: { stockLevel } });
                }

                // Create an inventory transaction for this import
                const tx = new InventoryTransaction({
                    sku,
                    change: stockLevel, // Positive for import
                    quantity: stockLevel,
                    source: 'import',
                    userId: 'import-script',
                    priceUsed: isNaN(price) ? null : price,
                    scannedBarcode: sku,
                    notes: 'Imported via CSV'
                });
                if (session) await tx.save({ session }); else await tx.save();
            }

            // Count created vs updated roughly by checking createdAt 
            // (if doc.createdAt is close to now we assume created). Simpler: try find existed before
            results.updated++;
        } catch (e) {
            results.errors.push({ row: idx+2, error: e.message });
        }
    }
    return results;
}

module.exports = { parseCSV, importItemsFromCSV };