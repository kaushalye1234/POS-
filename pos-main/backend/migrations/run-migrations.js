/* Migration script: ensure items have SKUs and create indexes for inventory transactions
 * Run: node migrations/run-migrations.js
 */

const mongoose = require('mongoose');
const Item = require('../models/Item');
const InventoryTransaction = require('../models/InventoryTransaction');
const { generateSKU, generateBarcode } = require('../utils/skuGenerator');
const { mongoUri } = require('../config');

async function ensureSkuForItems() {
    const cursor = Item.find({ $or: [ { sku: { $exists: false } }, { sku: null }, { sku: '' } ] }).cursor();
    let updated = 0;
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        try {
            let base = (doc.category || doc.name || 'ITEM').toString();
            let newSku = generateSKU(base);
            // If conflict, append a counter until unique
            let attempt = 0;
            while (await Item.exists({ sku: newSku })) {
                attempt++;
                newSku = `${generateSKU(base)}-${attempt}`;
                if (attempt > 10) break;
            }
            doc.sku = newSku;
            await doc.save();
            updated++;
        } catch (e) {
            console.error('Failed to set sku for item id', doc._id, e.message);
        }
    }
    return updated;
}

async function createIndexes() {
    try {
        await InventoryTransaction.collection.createIndex({ scannedBarcode: 1 });
        await InventoryTransaction.collection.createIndex({ sku: 1 });
        // Ensure barcode index on items (sparse so pre-existing docs without barcode are fine)
        await Item.collection.createIndex({ barcode: 1 }, { sparse: true, unique: true });
        console.log('Indexes on InventoryTransaction and Item.barcode created');
    } catch (e) {
        console.error('Index creation failed', e.message);
    }
}

async function run() {
    const uri = mongoUri;
    console.log('Connecting to', uri);
    await mongoose.connect(uri, { maxPoolSize: 10 });
    try {
        const updated = await ensureSkuForItems();
        console.log('Items updated with SKUs:', updated);
        await createIndexes();
    } catch (e) {
        console.error('Migration failed', e);
    } finally {
        await mongoose.disconnect();
        console.log('Migration complete');
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
