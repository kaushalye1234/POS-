const { MongoMemoryServer } = require('mongodb-memory-server');
const { spawn } = require('child_process');
const fetch = global.fetch || require('node-fetch');
const mongoose = require('mongoose');
const { registerOrLogin, jsonHeaders } = require('./auth-helper');

async function waitForServer(child, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server start timed out')), timeout);
        child.stdout.on('data', (data) => {
            const s = data.toString();
            // Wait for server ready log
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
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    console.log('Started in-memory MongoDB at', uri);

    // Start backend server as child process with MONGO_URI pointing to in-memory server
    const env = { ...process.env, MONGO_URI: uri, PORT: '5001' };
    const child = spawn(process.execPath, ['server.js'], { cwd: __dirname + '/../', env, stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', d => console.error('SERVER ERR>', d.toString()));
    child.stdout.on('data', d => console.log('SERVER OUT>', d.toString()));

    try {
        await waitForServer(child, 15000);
        const base = 'http://localhost:5001';
        const auth = await registerOrLogin(base, {
            username: 'integration_admin_memory',
            employeeId: 'E901'
        });
        const headers = jsonHeaders(auth.token);

        // 1) Create an item
        const createResp = await fetch(`${base}/api/items`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ sku: 'TESTSKU1', name: 'Test Item', price: 50, stockLevel: 10 })
        });
        if (!createResp.ok) throw new Error('Create item failed: ' + (await createResp.text()));
        console.log('Item created');

        // 2) Post a sale of quantity 2
        const now = new Date();
        const sale = {
            employeeId: 'E1',
            totalAmount: 100,
            subTotal: 100,
            discount: 0,
            amountReceived: 100,
            changeAmount: 0,
            itemsCount: 2,
            saleDate: now.toISOString().split('T')[0],
            saleTime: now.toTimeString().split(' ')[0],
            items: [{ sku: 'TESTSKU1', itemName: 'Test Item', quantity: 2, unitPrice: 50, totalPrice: 100 }]
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
        const getItem = await fetch(`${base}/api/items/TESTSKU1`, { headers });
        if (!getItem.ok) throw new Error('Get item failed');
        const item = await getItem.json();
        if (item.stockLevel !== 8) throw new Error('Stock level expected 8 but got ' + item.stockLevel);
        console.log('Stock decremented correctly to', item.stockLevel);

        // 4) Verify inventory transaction recorded in DB
        await mongoose.connect(uri, { maxPoolSize: 5 });
        const InventoryTransaction = require('../models/InventoryTransaction');
        const txs = await InventoryTransaction.find({ sku: 'TESTSKU1' });
        if (!txs || txs.length === 0) throw new Error('No inventory transactions found for TESTSKU1');
        console.log('Inventory transaction recorded:', txs.length);

        // Cleanup
        await mongoose.disconnect();
        child.kill();
        await mongod.stop();
        console.log('Integration test passed');
        process.exit(0);
    } catch (err) {
        console.error('Integration test failed:', err);
        child.kill();
        await mongod.stop();
        process.exit(2);
    }
}

run();
