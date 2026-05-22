// ============================================================
// Fashion Shaa POS - Returns & Refunds Logic (v4)
// ============================================================

let allReturnsData = [];
let currentSaleData = null;
let currentSaleItems = [];

function formatCurrency(amt) {
    return 'Rs.' + (amt||0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(text) {
    const d = document.createElement('div'); d.textContent = text||''; return d.innerHTML;
}

function getSaleRecordIdSafe(sale) {
    if (window.POS_API && typeof window.POS_API.getSaleRecordId === 'function') {
        return window.POS_API.getSaleRecordId(sale);
    }
    const rawId = sale && (sale._id || sale.id);
    return rawId == null ? '' : String(rawId);
}

function getSaleReceiptIdSafe(sale) {
    if (window.POS_API && typeof window.POS_API.getSaleReceiptId === 'function') {
        return window.POS_API.getSaleReceiptId(sale);
    }
    const recordId = getSaleRecordIdSafe(sale);
    return sale && sale.receiptId ? String(sale.receiptId) : (recordId ? `SALE-${recordId.slice(-6).toUpperCase()}` : '');
}

function matchesSaleReferenceSafe(sale, reference) {
    if (window.POS_API && typeof window.POS_API.matchesSaleReference === 'function') {
        return window.POS_API.matchesSaleReference(sale, reference);
    }
    const lookup = String(reference || '').trim().replace(/^#/, '').toUpperCase();
    return lookup && (getSaleRecordIdSafe(sale).toUpperCase() === lookup || getSaleReceiptIdSafe(sale).toUpperCase() === lookup);
}

function formatReturnDate(dateValue) {
    if (!dateValue) return '—';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return escHtml(String(dateValue));
    return parsed.toLocaleString('en-LK', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getSelectedReturnItems() {
    return Array.from(document.querySelectorAll('.return-item-check:checked'))
        .map((checkbox) => currentSaleItems[Number(checkbox.dataset.idx)])
        .filter(Boolean);
}

function buildReturnItemsPayload(items) {
    return items.map((item) => {
        const quantity = Number(item.quantity || 0) || 1;
        const unitPrice = Number(item.unitPrice || item.price || 0);
        return {
            sku: item.sku || null,
            name: item.itemName || item.name || 'Item',
            price: unitPrice,
            quantity,
            returnQty: quantity,
            refundAmount: unitPrice * quantity
        };
    });
}

// ===== Load Returns =====
async function loadReturns() {
    allReturnsData = await getAllReturns();
    renderReturnsTable(allReturnsData);
    updateStats(allReturnsData);
}

function updateStats(returns) {
    document.getElementById('statReturns').textContent = returns.length;
    const totalRefunded = returns.reduce((s, r) => s + (r.refundAmount || 0), 0);
    document.getElementById('statRefunded').textContent = formatCurrency(totalRefunded);
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthReturns = returns.filter(r => (r.date||'').startsWith(thisMonth));
    document.getElementById('statMonth').textContent = monthReturns.length;
    const avg = returns.length ? totalRefunded / returns.length : 0;
    document.getElementById('statAvg').textContent = formatCurrency(avg);
}

function renderReturnsTable(returns) {
    const tbody = document.getElementById('returnsTableBody');
    if (!returns.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-10 text-center text-slate-500 italic">No returns recorded</td></tr>';
        return;
    }
    tbody.innerHTML = returns.slice().reverse().map(r => `
        <tr class="hover:bg-white/5 transition-colors">
            <td class="px-5 py-3 font-mono text-slate-300">#RET-${r.id}</td>
            <td class="px-5 py-3">
                <div class="font-mono font-bold text-primary">${escHtml(r.receiptId || '—')}</div>
                <div class="text-[11px] text-slate-500 break-all">${escHtml(r.originalSaleId || '—')}</div>
            </td>
            <td class="px-5 py-3 text-slate-400 text-xs">${formatReturnDate(r.processedAt || r.date)}</td>
            <td class="px-5 py-3 text-slate-300">${escHtml(r.cashierId || r.employeeId || '—')}</td>
            <td class="px-5 py-3 text-right font-bold text-red-400">${formatCurrency(r.totalRefund ?? r.refundAmount)}</td>
            <td class="px-5 py-3 text-center"><span class="status-badge status-processed">Processed</span></td>
            <td class="px-5 py-3 text-slate-400 text-xs">${escHtml(r.reason||'—')}</td>
        </tr>
    `).join('');
}

function filterReturns(query) {
    const q = query.toLowerCase();
    if (!q) { renderReturnsTable(allReturnsData); return; }
    const filtered = allReturnsData.filter(r =>
        String(r.id).includes(q) ||
        String(r.originalSaleId).includes(q) ||
        String(r.receiptId || '').toLowerCase().includes(q) ||
        (r.reason||'').toLowerCase().includes(q) ||
        String(r.cashierId || r.employeeId || '').toLowerCase().includes(q)
    );
    renderReturnsTable(filtered);
}

// ===== Sale Lookup =====
async function lookupSale() {
    const saleIdRaw = document.getElementById('saleIdInput').value.trim();
    if (!saleIdRaw) { alert('Please enter a receipt number or Sale ID.'); return; }

    try {
        const sales = await getAllSales();
        currentSaleData = sales.find((sale) => matchesSaleReferenceSafe(sale, saleIdRaw));
        if (!currentSaleData) {
            alert('Sale not found. Use the receipt number from the bill or the full Sale ID from Invoice History.');
            document.getElementById('salePreview').classList.add('hidden');
            return;
        }

        const saleRecordId = getSaleRecordIdSafe(currentSaleData);
        const saleReceiptId = getSaleReceiptIdSafe(currentSaleData);
        currentSaleItems = await getSaleItemsBySaleId(saleRecordId);

        const preview = document.getElementById('salePreviewContent');
        preview.innerHTML = `
            <div class="flex justify-between py-1 border-b border-slate-700/30 gap-3"><span class="text-slate-400">Receipt No.:</span><span class="font-mono font-bold text-white text-right">${escHtml(saleReceiptId || '—')}</span></div>
            <div class="flex justify-between py-1 border-b border-slate-700/30 gap-3"><span class="text-slate-400">Sale ID:</span><span class="font-mono text-xs text-slate-300 text-right break-all">${escHtml(saleRecordId || '—')}</span></div>
            <div class="flex justify-between py-1 border-b border-slate-700/30"><span class="text-slate-400">Date:</span><span class="font-semibold text-slate-300">${escHtml(currentSaleData.saleDate || '—')} ${escHtml(currentSaleData.saleTime || '')}</span></div>
            <div class="flex justify-between py-1 border-b border-slate-700/30"><span class="text-slate-400">Employee:</span><span class="font-semibold text-slate-300">${escHtml(currentSaleData.employeeId)}</span></div>
            <div class="flex justify-between py-1 border-b border-slate-700/30"><span class="text-slate-400">Items:</span><span class="font-semibold text-slate-300">${currentSaleItems.length} types</span></div>
            <div class="flex justify-between py-1"><span class="text-slate-400">Total:</span><span class="font-black text-primary">${formatCurrency(currentSaleData.totalAmount)}</span></div>
        `;

        document.getElementById('salePreview').classList.remove('hidden');
    } catch (err) {
        alert('Error looking up sale: ' + err.message);
    }
}

// ===== Return Modal =====
function openReturnModal() {
    if (!currentSaleData) return;

    const itemsList = document.getElementById('returnItemsList');
    if (!currentSaleItems.length) {
        itemsList.innerHTML = '<p class="text-sm text-slate-400 italic">No item details found for this sale.</p>';
    } else {
        itemsList.innerHTML = currentSaleItems.map((item, idx) => `
            <label class="flex items-center gap-3 bg-slate-800/50 border border-slate-700/30 rounded-lg p-3 cursor-pointer hover:border-slate-500 transition-all">
                <input type="checkbox" class="return-item-check w-4 h-4 accent-primary" data-idx="${idx}" data-price="${item.unitPrice}" data-qty="${item.quantity}" />
                <div class="flex-1">
                    <p class="text-sm font-semibold text-white">${escHtml(item.itemName)}</p>
                    <p class="text-xs text-slate-400">${formatCurrency(item.unitPrice)} × ${item.quantity} = ${formatCurrency(item.totalPrice)}</p>
                </div>
            </label>
        `).join('');
    }

    document.getElementById('refundAmount').value = '';
    document.getElementById('returnNotes').value = '';
    document.getElementById('returnEmpId').value = '';

    // Auto-calc refund when items checked
    document.querySelectorAll('.return-item-check').forEach(cb => {
        cb.addEventListener('change', autoCalcRefund);
    });

    document.getElementById('returnModal').classList.add('active');
}

function autoCalcRefund() {
    let total = 0;
    document.querySelectorAll('.return-item-check:checked').forEach(cb => {
        total += parseFloat(cb.dataset.price || 0) * parseInt(cb.dataset.qty || 1);
    });
    if (total > 0) document.getElementById('refundAmount').value = total.toFixed(2);
}

function closeReturnModal() {
    document.getElementById('returnModal').classList.remove('active');
}

async function confirmReturn() {
    const refundAmount = parseFloat(document.getElementById('refundAmount').value);
    const reason = document.getElementById('returnReason').value;
    const empIdRaw = document.getElementById('returnEmpId').value;
    const notes = document.getElementById('returnNotes').value.trim();
    const selectedItems = getSelectedReturnItems();

    if (!refundAmount || refundAmount <= 0) { alert('Please enter a valid refund amount.'); return; }
    if (!empIdRaw) { alert('Please enter the employee ID.'); return; }
    if (!selectedItems.length) { alert('Select at least one item to return.'); return; }

    const saleRecordId = getSaleRecordIdSafe(currentSaleData);
    const receiptId = getSaleReceiptIdSafe(currentSaleData);
    const itemsPayload = buildReturnItemsPayload(selectedItems);
    const totalReturnedQty = itemsPayload.reduce((sum, item) => sum + Number(item.returnQty || 0), 0);

    const returnRecord = {
        saleId: saleRecordId,
        originalSaleId: saleRecordId,
        receiptId,
        itemSku: itemsPayload[0].sku || itemsPayload[0].name || 'RETURN',
        quantity: totalReturnedQty,
        items: itemsPayload,
        totalRefund: refundAmount,
        refundAmount,
        reason,
        employeeId: 'E' + parseInt(empIdRaw),
        cashierId: 'E' + parseInt(empIdRaw),
        notes,
        date: new Date().toISOString(),
        time: new Date().toTimeString().split(' ')[0],
        processedAt: new Date().toISOString()
    };

    try {
        await saveReturn(returnRecord);
        closeReturnModal();
        document.getElementById('salePreview').classList.add('hidden');
        document.getElementById('saleIdInput').value = '';
        currentSaleData = null;
        currentSaleItems = [];
        await loadReturns();
        showSuccessToast(`Return processed for ${receiptId || 'sale'}: ${formatCurrency(refundAmount)}`);
    } catch (err) {
        alert('Failed to save return: ' + err.message);
    }
}

function showSuccessToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 z-50 bg-secondary text-white px-6 py-3 rounded-xl font-bold shadow-2xl text-sm flex items-center gap-2';
    toast.innerHTML = `<span class="material-symbols-outlined text-sm">check_circle</span> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

document.getElementById('saleIdInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        lookupSale();
    }
});

initDatabase().then(() => loadReturns());

/* placeholder aria-label */
