const { spawn } = require('child_process');
const fetch = global.fetch || require('node-fetch');
const mongoose = require('mongoose');
const config = require('../config');
const { getBusinessTimestampParts } = require('../utils/businessTime');
const { registerOrLogin, jsonHeaders } = require('./auth-helper');

async function waitForServer(child, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server start timed out')), timeout);
        child.stdout.on('data', (data) => {
            const s = data.toString();
            if (s.includes('Server running')) {
                clearTimeout(timer);
                resolve();
            }
        });
        child.on('exit', (code) => {
            clearTimeout(timer);
            reject(new Error('Server exited unexpectedly with code ' + code));
        });
    });
}

async function run() {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fashion_shaa_pos_test_smoke';
    console.log('Using MongoDB at', uri);
    await mongoose.connect(uri, { maxPoolSize: 5 });
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    // Start backend server as child process with MONGO_URI pointing to DB
    const env = { ...process.env, MONGO_URI: uri, PORT: '5010' };
    const child = spawn(process.execPath, ['server.js'], { cwd: __dirname + '/../', env, stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', d => console.error('SERVER ERR>', d.toString()));
    child.stdout.on('data', d => console.log('SERVER OUT>', d.toString()));

    try {
        await waitForServer(child, 15000);
        const base = 'http://localhost:5010';
        const auth = await registerOrLogin(base, {
            username: 'integration_admin_smoke',
            employeeId: 'E903'
        });
        const headers = jsonHeaders(auth.token);

        // 0) Clean previous test artifacts
        await fetch(`${base}/api/items/QA-BAR-1`, { method: 'DELETE', headers }).catch(()=>{});
        await fetch(`${base}/api/items/QA-SKU-1`, { method: 'DELETE', headers }).catch(()=>{});

        // 1) Create item with barcode
        let resp = await fetch(`${base}/api/items`, {
            method: 'POST', headers,
            body: JSON.stringify({ sku: 'QA-SKU-1', barcode: '8901234567890', name: 'QA Barcode Item', price: 12.5, stockLevel: 10 })
        });
        if (!resp.ok) throw new Error('Create item failed: ' + (await resp.text()));
        console.log('Item with barcode created');

        // 2) Test barcode parse endpoint (simple barcode without embedded price)
        resp = await fetch(`${base}/api/barcode/parse`, {
            method: 'POST', headers,
            body: JSON.stringify({ code: '8901234567890' })
        });
        if (!resp.ok) throw new Error('Barcode parse failed: ' + (await resp.text()));
        const parsed = await resp.json();
        if (!parsed || !parsed.item || parsed.item.sku !== 'QA-SKU-1') throw new Error('Barcode parse did not return expected item mapping');
        console.log('Barcode parse returned item SKU:', parsed.item.sku);

        // 3) Test CSV import endpoint
        const csv = 'sku,name,price,stockLevel,barcode\nQA-BAR-1,Imported QA Item,5.5,3,9001112223334';
        resp = await fetch(`${base}/api/items/import`, { method: 'POST', headers, body: JSON.stringify({ csv }) });
        if (!resp.ok) throw new Error('Import endpoint failed: ' + (await resp.text()));
        const importRes = await resp.json();
        console.log('Import result:', importRes);
        if (importRes.errors && importRes.errors.length > 0) throw new Error('Import reported errors: ' + JSON.stringify(importRes.errors));

        // 4) Post a sale using barcode-derived SKU
        const now = new Date();
        const businessNow = getBusinessTimestampParts(now, config.businessTimeZone);
        const sale = {
            employeeId: 'EQA', totalAmount: 25, subTotal: 25, discount: 0, amountReceived: 25, changeAmount: 0,
            itemsCount: 2, saleDate: businessNow.saleDate, saleTime: businessNow.saleTime,
            items: [{ sku: 'QA-SKU-1', itemName: 'QA Barcode Item', quantity: 2, unitPrice: 12.5, totalPrice: 25 }]
        };
        resp = await fetch(`${base}/api/sales`, { method: 'POST', headers, body: JSON.stringify(sale) });
        if (!resp.ok) throw new Error('Sale failed: ' + (await resp.text()));
        const saleData = await resp.json();
        console.log('Sale saved:', saleData._id);

        // 5) Verify stock decreased for QA-SKU-1 from 10 -> 8
        resp = await fetch(`${base}/api/items/QA-SKU-1`, { headers });
        if (!resp.ok) throw new Error('Get item failed');
        const item = await resp.json();
        if (item.stockLevel !== 8) throw new Error('Stock level expected 8 but got ' + item.stockLevel);
        console.log('Stock decremented correctly to', item.stockLevel);

        // 6) Verify InventoryTransaction exists for QA-SKU-1
        await mongoose.connect(uri, { maxPoolSize: 5 });
        const InventoryTransaction = require('../models/InventoryTransaction');
        const txs = await InventoryTransaction.find({ sku: 'QA-SKU-1' });
        if (!txs || txs.length === 0) throw new Error('No inventory transactions found for QA-SKU-1');
        console.log('Inventory transaction recorded:', txs.length);
        await mongoose.disconnect();

        // Cleanup
        child.kill();
        console.log('Smoke tests passed');
        process.exit(0);
    } catch (err) {
        console.error('Smoke tests failed:', err);
        child.kill();
        process.exit(2);
    }
}

run();
