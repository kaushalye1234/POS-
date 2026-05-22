// Database Migration Utility (IndexedDB to MongoDB)
// Triggered from settings.html

function getApiBaseForMigration() {
    if (window.POS_API && typeof window.POS_API.getApiBase === 'function') {
        return window.POS_API.getApiBase();
    }
    throw new Error('POS API helper is unavailable.');
}

async function migrateToMongoDB() {
    const statusDiv = document.getElementById('migrationStatus');
    const btnMigrate = document.getElementById('btnMigrateDB');

    if (!statusDiv || !btnMigrate) return;
    let apiOrigin = 'the configured API origin';

    try {
        const posApi = window.POS_API || {};
        if (typeof posApi.fetchAPI !== 'function') {
            throw new Error('POS API helper is unavailable.');
        }

        const apiBase = getApiBaseForMigration();
        apiOrigin = apiBase.replace(/\/api$/, '');

        if (!confirm(`Are you sure you want to migrate all data to MongoDB? This requires the Node.js backend to be running at ${apiOrigin}.`)) {
            return;
        }

        btnMigrate.disabled = true;
        btnMigrate.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Migrating...';
        statusDiv.className = 'text-sm font-semibold rounded-lg p-4 bg-slate-800 text-center text-blue-400 block';
        statusDiv.textContent = 'Starting Migration Process... Please wait.';

        // Ensure IndexedDB is initialized
        if (!window.db) {
            await initDatabase();
        }

        // 1. Migrate Employees
        statusDiv.textContent = 'Migrating Employees...';
        const employees = await getAllEmployees();
        for (const emp of employees) {
            await posApi.fetchAPI('/employees', {
                method: 'POST',
                body: {
                    empId: emp.id,
                    name: emp.name,
                    phone: emp.phone || '',
                    role: emp.role || 'cashier'
                }
            }).catch(e => console.error('Employee migration skipped (might exist):', emp.id));
        }

        // 2. Migrate Inventory Items
        statusDiv.textContent = 'Migrating Inventory...';
        const inventory = await getAllInventoryItems();
        let skippedItems = 0;
        for (const item of inventory) {
            await posApi.fetchAPI('/items', {
                method: 'POST',
                body: {
                    sku: `SKU-OLD-${item.id}`,
                    name: item.name,
                    price: 0, // Old DB didn't store base price, only per-sale price
                    category: 'Legacy'
                }
            }).catch(e => {
                skippedItems++;
                console.error('Item migration error:', e);
            });
        }

        // 3. Migrate Sales and Sale Items
        statusDiv.textContent = 'Migrating Sales History...';
        const sales = await getAllSales();
        let migratedSalesCount = 0;
        for (const sale of sales) {
            // Get embedded items for this sale from IndexedDB
            const saleItems = await getSaleItemsBySaleId(sale.id);
            
            // Format items to match Mongoose schema
            const formattedItems = saleItems.map(si => ({
                itemName: si.itemName,
                sku: si.sku || null,
                category: si.category || null,
                quantity: si.quantity,
                unitPrice: si.unitPrice,
                totalPrice: si.totalPrice,
                discountEligible: !!si.discountEligible
            }));

            await posApi.fetchAPI('/sales', {
                method: 'POST',
                body: {
                    employeeId: sale.employeeId,
                    totalAmount: sale.totalAmount,
                    subTotal: sale.subTotal,
                    discount: sale.discount,
                    amountReceived: sale.amountReceived,
                    changeAmount: sale.changeAmount,
                    itemsCount: sale.itemsCount,
                    saleDate: sale.saleDate,
                    saleTime: sale.saleTime,
                    items: formattedItems
                }
            }).then(() => {
                migratedSalesCount++;
            }).catch(e => console.error('Sale migration error:', e));
        }

        statusDiv.className = 'text-sm font-semibold rounded-lg p-4 bg-emerald-900/50 text-emerald-400 border border-emerald-500/20 block text-center';
        statusDiv.innerHTML = `✅ <b>Migration Successful!</b><br>Migrated ${employees.length} Employees, ${inventory.length - skippedItems} Items, and ${migratedSalesCount} Sales.`;
        btnMigrate.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Complete';

    } catch (err) {
        console.error('Migration failed:', err);
        statusDiv.className = 'text-sm font-semibold rounded-lg p-4 bg-red-900/50 text-red-400 border border-red-500/20 block text-center';
        statusDiv.textContent = `❌ Migration Failed: ${err.message}. Ensure the API server is reachable at ${apiOrigin}.`;
        btnMigrate.innerHTML = '<span class="material-symbols-outlined">database</span> Retry Migration';
        btnMigrate.disabled = false;
    }
}

// Bind event listener
document.addEventListener('DOMContentLoaded', () => {
    const btnMigrate = document.getElementById('btnMigrateDB');
    if (btnMigrate) {
        btnMigrate.addEventListener('click', migrateToMongoDB);
    }
});

/* placeholder aria-label */
