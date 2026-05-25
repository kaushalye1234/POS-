/* Migration script: ensure items have SKUs and create indexes for inventory transactions
 * Run: node migrations/run-migrations.js
 */

const mongoose = require('mongoose');
const Item = require('../models/Item');
const Sale = require('../models/Sale');
const InventoryTransaction = require('../models/InventoryTransaction');
const config = require('../config');
const { generateSKU, generateBarcode } = require('../utils/skuGenerator');
const { formatBusinessDate, formatBusinessTime } = require('../utils/businessTime');
const { connectMongo, redactMongoUri } = require('../mongoConnection');

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

async function repairSaleBusinessDates() {
    const cursor = Sale.find({ createdAt: { $exists: true } }).cursor();
    let updated = 0;

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        try {
            const correctedDate = formatBusinessDate(doc.createdAt, config.businessTimeZone);
            const correctedTime = formatBusinessTime(doc.createdAt, config.businessTimeZone);
            let changed = false;

            if (doc.saleDate !== correctedDate) {
                doc.saleDate = correctedDate;
                changed = true;
            }

            if (!doc.saleTime || !/^\d{2}:\d{2}:\d{2}$/.test(String(doc.saleTime))) {
                doc.saleTime = correctedTime;
                changed = true;
            }

            if (changed) {
                await doc.save();
                updated++;
            }
        } catch (e) {
            console.error('Failed to repair sale date for sale id', doc._id, e.message);
        }
    }

    return updated;
}

async function run() {
    const connection = await connectMongo(mongoose, { maxPoolSize: 10 });
    console.log(`Connecting to ${redactMongoUri(connection.uri)} (${connection.source})`);
    try {
        const updated = await ensureSkuForItems();
        console.log('Items updated with SKUs:', updated);
        await createIndexes();
        const repairedSales = await repairSaleBusinessDates();
        console.log('Sales repaired for business date/time:', repairedSales);
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
