// ============================================================
// Fashion Shaa POS - Supplier & Purchase Order Logic (v4)
// ============================================================

let allSuppliers = [];
let allOrders = [];
let editingSupplierId = null;
let currentTab = 'suppliers';

function escHtml(text) { const d = document.createElement('div'); d.textContent = text||''; return d.innerHTML; }
function formatCurrency(amt) { return 'Rs.' + (amt||0).toLocaleString('en-LK', {minimumFractionDigits:2,maximumFractionDigits:2}); }

async function loadAll() {
    try {
        allSuppliers = await getAllSuppliers();
        allOrders = await getAllPurchaseOrders();
        renderSuppliersTable(allSuppliers);
        renderOrdersTable(allOrders);
        populateSupplierDropdown();
    } catch (error) {
        console.error('Failed to load supplier data:', error);
        alert(error.message || 'Failed to load suppliers and purchase orders.');
    }
}

// ===== Tab Switch =====
function switchTab(tab) {
    currentTab = tab;
    document.getElementById('suppliersTab').classList.toggle('hidden', tab !== 'suppliers');
    document.getElementById('ordersTab').classList.toggle('hidden', tab !== 'orders');
    document.getElementById('tabSuppliers').className = `px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${tab==='suppliers' ? 'bg-primary text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`;
    document.getElementById('tabOrders').className = `px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${tab==='orders' ? 'bg-secondary text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`;
}

// ===== Suppliers =====
function renderSuppliersTable(suppliers) {
    const tbody = document.getElementById('suppliersTableBody');
    if (!suppliers.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-10 text-center text-slate-500 italic">No suppliers added yet</td></tr>';
        return;
    }
    tbody.innerHTML = suppliers.map(s => `
        <tr class="hover:bg-white/5 transition-colors">
            <td class="px-5 py-4">
                <p class="font-bold text-white">${escHtml(s.name)}</p>
                ${s.notes ? `<p class="text-xs text-slate-500 mt-0.5">${escHtml(s.notes)}</p>` : ''}
            </td>
            <td class="px-5 py-4 text-slate-300">${escHtml(s.contact||'—')}</td>
            <td class="px-5 py-4 text-slate-300">${escHtml(s.phone||'—')}</td>
            <td class="px-5 py-4"><span class="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300">${escHtml(s.categories||'—')}</span></td>
            <td class="px-5 py-4 text-slate-400 text-sm">${escHtml(s.location||'—')}</td>
            <td class="px-5 py-4 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button onclick="openSupplierModal(${s.id})" class="bg-blue-700/40 hover:bg-blue-600 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button onclick="deleteSupplierById(${s.id})" class="bg-red-700/40 hover:bg-red-600 text-red-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterSuppliers(query) {
    const q = query.toLowerCase();
    renderSuppliersTable(q ? allSuppliers.filter(s =>
        (s.name||'').toLowerCase().includes(q) || (s.contact||'').toLowerCase().includes(q) || (s.categories||'').toLowerCase().includes(q)
    ) : allSuppliers);
}

function openSupplierModal(id = null) {
    editingSupplierId = id;
    document.getElementById('supModalTitle').innerHTML = `<span class="material-symbols-outlined text-primary">local_shipping</span> ${id ? 'Edit' : 'Add'} Supplier`;
    if (id) {
        const s = allSuppliers.find(x => x.id === id);
        if (s) {
            document.getElementById('supName').value = s.name||'';
            document.getElementById('supContact').value = s.contact||'';
            document.getElementById('supPhone').value = s.phone||'';
            document.getElementById('supEmail').value = s.email||'';
            document.getElementById('supLocation').value = s.location||'';
            document.getElementById('supCategories').value = s.categories||'';
            document.getElementById('supNotes').value = s.notes||'';
        }
    } else {
        ['supName','supContact','supPhone','supEmail','supLocation','supCategories','supNotes'].forEach(id => document.getElementById(id).value = '');
    }
    document.getElementById('supplierModal').classList.add('active');
}

function closeSupplierModal() { document.getElementById('supplierModal').classList.remove('active'); editingSupplierId = null; }

async function saveSupplierForm() {
    const name = document.getElementById('supName').value.trim();
    if (!name) { alert('Please enter a supplier name.'); return; }
    const data = {
        name, contact: document.getElementById('supContact').value.trim(),
        phone: document.getElementById('supPhone').value.trim(),
        email: document.getElementById('supEmail').value.trim(),
        location: document.getElementById('supLocation').value.trim(),
        categories: document.getElementById('supCategories').value.trim(),
        notes: document.getElementById('supNotes').value.trim(),
        createdAt: editingSupplierId ? undefined : new Date().toISOString()
    };
    if (editingSupplierId) data.id = editingSupplierId;
    try {
        await saveSupplier(data);
        closeSupplierModal();
        await loadAll();
    } catch (error) {
        console.error('Failed to save supplier:', error);
        alert(error.message || 'Failed to save supplier.');
    }
}

async function deleteSupplierById(id) {
    const s = allSuppliers.find(x => x.id === id);
    if (!s || !confirm(`Delete supplier "${s.name}"?`)) return;
    await deleteSupplier(id);
    await loadAll();
}

// ===== Purchase Orders =====
function populateSupplierDropdown() {
    const sel = document.getElementById('poSupplier');
    sel.innerHTML = '<option value="">Select Supplier...</option>' +
        allSuppliers.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
}

function renderOrdersTable(orders) {
    const tbody = document.getElementById('ordersTableBody');
    if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-10 text-center text-slate-500 italic">No purchase orders yet</td></tr>';
        return;
    }
    const sorted = [...orders].sort((a,b)=>(b.id||0)-(a.id||0));
    tbody.innerHTML = sorted.map(o => {
        const sup = allSuppliers.find(s => s.id == o.supplierId);
        const statusMap = { pending:'po-status-pending', ordered:'po-status-ordered', received:'po-status-received' };
        return `
        <tr class="hover:bg-white/5 transition-colors">
            <td class="px-5 py-4 font-mono text-slate-300">#PO-${o.id}</td>
            <td class="px-5 py-4 font-semibold text-white">${escHtml(sup?.name||'Unknown')}</td>
            <td class="px-5 py-4 text-slate-400 text-xs">${o.date||'—'}</td>
            <td class="px-5 py-4 text-slate-300 text-xs max-w-[200px] truncate">${escHtml(o.items||'—')}</td>
            <td class="px-5 py-4 text-right font-bold text-white">${formatCurrency(o.cost)}</td>
            <td class="px-5 py-4 text-center"><span class="po-badge ${statusMap[o.status]||''}">${o.status||'pending'}</span></td>
            <td class="px-5 py-4 text-center">
                <button onclick="markOrderReceived(${o.id})" class="bg-secondary/20 hover:bg-secondary/40 text-secondary px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 mx-auto">
                    <span class="material-symbols-outlined text-sm">check</span> Mark Received
                </button>
            </td>
        </tr>`;
    }).join('');
}

function filterOrders(query) {
    const q = query.toLowerCase();
    renderOrdersTable(q ? allOrders.filter(o => {
        const sup = allSuppliers.find(s=>s.id==o.supplierId);
        return (sup?.name||'').toLowerCase().includes(q) || (o.items||'').toLowerCase().includes(q) || String(o.id).includes(q);
    }) : allOrders);
}

function openOrderModal() {
    document.getElementById('poDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('poDelivery').value = '';
    document.getElementById('poItems').value = '';
    document.getElementById('poCost').value = '';
    document.getElementById('poStatus').value = 'pending';
    document.getElementById('poNotes').value = '';
    populateSupplierDropdown();
    document.getElementById('orderModal').classList.add('active');
}

function closeOrderModal() { document.getElementById('orderModal').classList.remove('active'); }

async function saveOrderForm() {
    const supplierId = document.getElementById('poSupplier').value;
    if (!supplierId) { alert('Please select a supplier.'); return; }
    const items = document.getElementById('poItems').value.trim();
    if (!items) { alert('Please enter the items ordered.'); return; }

    const data = {
        supplierId: supplierId.toString(),
        date: document.getElementById('poDate').value,
        deliveryDate: document.getElementById('poDelivery').value,
        items,
        cost: parseFloat(document.getElementById('poCost').value) || 0,
        status: document.getElementById('poStatus').value,
        notes: document.getElementById('poNotes').value.trim(),
        createdAt: new Date().toISOString()
    };
    try {
        await savePurchaseOrder(data);
        closeOrderModal();
        await loadAll();
    } catch (error) {
        console.error('Failed to save purchase order:', error);
        alert(error.message || 'Failed to create purchase order.');
    }
}

async function markOrderReceived(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order || !confirm('Mark this order as received?')) return;
    order.status = 'received';
    order.receivedAt = new Date().toISOString();
    await savePurchaseOrder(order);
    await loadAll();
}

initDatabase().then(() => loadAll());

/* placeholder aria-label */
