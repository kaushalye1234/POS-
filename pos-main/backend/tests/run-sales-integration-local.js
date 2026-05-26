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
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fashion_shaa_pos_test';
    console.log('Using MongoDB at', uri);
    await mongoose.connect(uri, { maxPoolSize: 5 });
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    // Start backend server as child process with MONGO_URI pointing to DB
    const env = {
        ...process.env,
        MONGO_URI: uri,
        MONGO_CONNECTION_MODE: 'single',
        MONGO_REMOTE_URI: '',
        MONGO_LOCAL_URI: '',
        MONGO_SYNC_ENABLED: 'false',
        PORT: '5002'
    };
    const child = spawn(process.execPath, ['server.js'], { cwd: __dirname + '/../', env, stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', d => console.error('SERVER ERR>', d.toString()));
    child.stdout.on('data', d => console.log('SERVER OUT>', d.toString()));

    try {
        await waitForServer(child, 15000);
        const base = 'http://localhost:5002';
        const auth = await registerOrLogin(base, {
            username: 'integration_admin_local',
            employeeId: 'E902'
        });
        const headers = jsonHeaders(auth.token);

        // 1) Ensure any previous test item is removed
        await fetch(`${base}/api/items/TESTSKU_INT`, { method: 'DELETE', headers }).catch(()=>{});

        // 2) Create an item
        const createResp = await fetch(`${base}/api/items`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ sku: 'TESTSKU_INT', name: 'Integration Item', price: 25, stockLevel: 5 })
        });
        if (!createResp.ok) throw new Error('Create item failed: ' + (await createResp.text()));
        console.log('Item created');

        // 2) Post a sale of quantity 3
        const now = new Date();
        const businessNow = getBusinessTimestampParts(now, config.businessTimeZone);
        const sale = {
            employeeId: 'E100',
            totalAmount: 75,
            subTotal: 75,
            discount: 0,
            amountReceived: 75,
            changeAmount: 0,
            itemsCount: 3,
            saleDate: businessNow.saleDate,
            saleTime: businessNow.saleTime,
            items: [{ sku: 'TESTSKU_INT', itemName: 'Integration Item', quantity: 3, unitPrice: 25, totalPrice: 75 }]
        };

        const saleResp = await fetch(`${base}/api/sales`, {
            method: 'POST', headers, body: JSON.stringify(sale)
        });

        if (!saleResp.ok) {
            const t = await saleResp.text();
            throw new Error('Sale failed: ' + t);
        }
        const saleData = await saleResp.json();
        console.log('Sale saved:', saleData._id);

        // 3) Verify item stock decreased
        const getItem = await fetch(`${base}/api/items/TESTSKU_INT`, { headers });
        if (!getItem.ok) throw new Error('Get item failed');
        const item = await getItem.json();
        if (item.stockLevel !== 2) throw new Error('Stock level expected 2 but got ' + item.stockLevel);
        console.log('Stock decremented correctly to', item.stockLevel);

        // 4) Verify inventory transaction recorded in DB
        await mongoose.connect(uri, { maxPoolSize: 5 });
        const InventoryTransaction = require('../models/InventoryTransaction');
        const txs = await InventoryTransaction.find({ sku: 'TESTSKU_INT' });
        if (!txs || txs.length === 0) throw new Error('No inventory transactions found for TESTSKU_INT');
        console.log('Inventory transaction recorded:', txs.length);

        // Cleanup
        await mongoose.disconnect();
        child.kill();
        console.log('Integration test passed');
        process.exit(0);
    } catch (err) {
        console.error('Integration test failed:', err);
        child.kill();
        process.exit(2);
    }
}

run();
