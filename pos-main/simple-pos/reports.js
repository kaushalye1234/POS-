// ============================================================
// Fashion Shaa POS - Invoice History & Reports Logic (v5)
// ============================================================

let allSales = [];
let allEmployees = [];
let filteredSales = [];
let currentViewingSaleId = null;
let currentViewingSale = null;

function escHtml(text) { const d = document.createElement('div'); d.textContent = text||''; return d.innerHTML; }
function formatCurrency(amt) { return 'Rs.' + parseFloat(amt||0).toLocaleString('en-LK', {minimumFractionDigits:2,maximumFractionDigits:2}); }
function formatReceiptAmount(amt) { return parseFloat(amt||0).toLocaleString('en-LK', {minimumFractionDigits:2,maximumFractionDigits:2}); }
function formatDateStr(isoStr) { 
    if(!isoStr) return '-'; 
    const d = new Date(isoStr); 
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); 
}

function formatReceiptDateParts(rawValue) {
    if (!rawValue) return { date: '-', time: '-' };
    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) return { date: '-', time: '-' };
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    const seconds = String(parsed.getSeconds()).padStart(2, '0');
    return {
        date: `${day}/${month}/${year}`,
        time: `${hours}:${minutes}:${seconds}`
    };
}

function setTextIfPresent(id, value) {
    const element = document.getElementById(id);
    if (element) element.innerText = value;
}

function setSaleAnnotationStatus(message = '', tone = 'muted') {
    const element = document.getElementById('saleAnnotationStatus');
    if (!element) return;

    element.textContent = message;
    element.className = 'mt-3 text-xs font-semibold';

    if (tone === 'success') {
        element.classList.add('text-emerald-400');
    } else if (tone === 'error') {
        element.classList.add('text-rose-400');
    } else {
        element.classList.add('text-slate-400');
    }
}

function formatDateInputValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function focusDateRangeFilters() {
    const filtersCard = document.getElementById('dateRangeFiltersCard');
    const startInput = document.getElementById('filterStartDate');
    if (filtersCard) {
        filtersCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        filtersCard.classList.add('ring-2', 'ring-primary/60');
        window.setTimeout(() => {
            filtersCard.classList.remove('ring-2', 'ring-primary/60');
        }, 1600);
    }
    startInput?.focus();
}

function applyDateRangeFilters() {
    filterInvoices();
}

function setDateRangePreset(preset) {
    const startInput = document.getElementById('filterStartDate');
    const endInput = document.getElementById('filterEndDate');
    if (!startInput || !endInput) return;

    const latestTimestamp = allSales.length > 0 ? allSales[0].timestamp : Date.now();
    const anchorDate = new Date(latestTimestamp);
    const endDate = new Date(anchorDate);
    const startDate = new Date(anchorDate);

    switch (preset) {
        case 'today':
            break;
        case '7days':
            startDate.setDate(anchorDate.getDate() - 6);
            break;
        case '30days':
            startDate.setDate(anchorDate.getDate() - 29);
            break;
        case 'month':
            startDate.setDate(1);
            break;
        case 'all':
            startInput.value = '';
            endInput.value = '';
            filterInvoices();
            return;
        default:
            return;
    }

    startInput.value = formatDateInputValue(startDate);
    endInput.value = formatDateInputValue(endDate);
    filterInvoices();
}

function normalizeSaleRecord(sale) {
    const rawTimestamp = sale.createdAt || sale.timestamp || (sale.saleDate ? `${sale.saleDate}T${sale.saleTime || '00:00:00'}` : null);
    const parsedDate = rawTimestamp ? new Date(rawTimestamp) : null;
    const hasValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
    const recordId = String(sale._id || sale.id || '');

    return {
        ...sale,
        id: recordId,
        receiptId: sale.receiptId || (recordId ? `SALE-${recordId.slice(-6).toUpperCase()}` : 'SALE'),
        timestamp: hasValidDate ? parsedDate.getTime() : 0,
        timestampIso: hasValidDate ? parsedDate.toISOString() : '',
        totalPrice: Number(sale.totalPrice ?? sale.totalAmount ?? 0),
        status: sale.status || 'completed',
        paymentMethod: sale.paymentMethod || 'CASH',
        customerName: sale.customerName || '',
        notes: sale.notes || '',
        discount: Number(sale.discount || 0),
        itemsCount: Number(sale.itemsCount || (sale.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0))
    };
}

async function init() {
    await initDatabase();

    loadEmployeesDropdown();
    await fetchSalesData();
}

async function loadEmployeesDropdown() {
    try {
        allEmployees = await getAllEmployees();
        const sel = document.getElementById('filterCashier');
        allEmployees.forEach(emp => {
            const employeeId = emp.empId || emp.id;
            if (!employeeId) return;
            const opt = document.createElement('option');
            opt.value = employeeId;
            opt.textContent = `${emp.name || employeeId} (ID:${employeeId})`;
            sel.appendChild(opt);
        });
    } catch(e) { console.error(e); }
}

function initializeDefaultDateFilters() {
    const startInput = document.getElementById('filterStartDate');
    const endInput = document.getElementById('filterEndDate');
    if (!startInput || !endInput) return;
    if (startInput.value || endInput.value) return;

    const latestTimestamp = allSales.length > 0 ? allSales[0].timestamp : null;
    const latestDate = latestTimestamp ? new Date(latestTimestamp) : new Date();
    const monthStart = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);

    startInput.value = formatDateInputValue(monthStart);
    endInput.value = formatDateInputValue(latestDate);
}

async function fetchSalesData() {
    try {
        allSales = (await getAllSales()).map(normalizeSaleRecord);
        // Sort newest first
        allSales.sort((a,b) => b.timestamp - a.timestamp);
        initializeDefaultDateFilters();
        filterInvoices(); // Applies filters and renders
    } catch (e) {
        console.error("Failed to fetch sales:", e);
        document.getElementById('invoicesTableBody').innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-500">Error loading data.</td></tr>`;
    }
}

function filterInvoices() {
    const search = document.getElementById('filterSearch').value.toLowerCase();
    const startDateStr = document.getElementById('filterStartDate').value;
    const endDateStr = document.getElementById('filterEndDate').value;
    const cashierId = document.getElementById('filterCashier').value;

    const startTs = startDateStr ? new Date(startDateStr).setHours(0,0,0,0) : 0;
    const endTs = endDateStr ? new Date(endDateStr).setHours(23,59,59,999) : Infinity;

    filteredSales = allSales.filter(sale => {
        // Date check
        if(sale.timestamp < startTs || sale.timestamp > endTs) return false;
        
        // Cashier check
        if(cashierId !== 'all' && sale.employeeId != cashierId) return false;

        // Search check
        if(search) {
            const matchReceipt = sale.receiptId && sale.receiptId.toLowerCase().includes(search);
            const matchCust = sale.customerName && sale.customerName.toLowerCase().includes(search);
            if(!matchReceipt && !matchCust) return false;
        }

        return true;
    });

    updateStats();
    renderTable();
}

function clearFilters() {
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    document.getElementById('filterCashier').value = 'all';
    filterInvoices();
}

function updateStats() {
    let revenue = 0;
    let refundsCount = 0;
    
    filteredSales.forEach(s => {
        if(s.status === 'completed') {
            revenue += s.totalPrice;
        } else if (s.status === 'voided') {
            refundsCount++;
        }
    });

    document.getElementById('statTotalSales').innerText = filteredSales.length;
    document.getElementById('statTotalRevenue').innerText = formatCurrency(revenue);
    document.getElementById('statTotalRefunds').innerText = refundsCount;
    
    // Update date range label
    const sd = document.getElementById('filterStartDate').value;
    const ed = document.getElementById('filterEndDate').value;
    if(sd && ed) document.getElementById('statDateRange').innerText = `${sd} to ${ed}`;
    else if(sd) document.getElementById('statDateRange').innerText = `Since ${sd}`;
    else if(ed) document.getElementById('statDateRange').innerText = `Until ${ed}`;
    else document.getElementById('statDateRange').innerText = `All Time`;
}

function renderTable() {
    const tbody = document.getElementById('invoicesTableBody');
    document.getElementById('showingResultsText').innerText = `Showing ${filteredSales.length} results`;

    if(filteredSales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-20 text-slate-500 italic">No invoices found matching current filters.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredSales.map(sale => {
        const emp = allEmployees.find(e => e.id == sale.employeeId);
        const cashierName = emp ? emp.name : `ID: ${sale.employeeId||'-'}`;
        
        let statusHtml = `<span class="status-completed">Completed</span>`;
        if(sale.status === 'voided') statusHtml = `<span class="status-voided">Voided</span>`;
        if(sale.status === 'refunded') statusHtml = `<span class="status-refunded">Refunded</span>`;

        return `
            <tr class="hover:bg-white/5 transition-colors group cursor-pointer invoice-row" data-sale-id="${sale.id}">
                <td class="px-6 py-4">${statusHtml}</td>
                <td class="px-6 py-4 font-mono font-bold text-white">${escHtml(sale.receiptId)}</td>
                <td class="px-6 py-4 text-slate-400">${formatDateStr(sale.timestampIso || sale.timestamp)}</td>
                <td class="px-6 py-4 text-slate-300">${escHtml(sale.customerName) || `<span class="italic text-slate-600">Walk-in</span>`}</td>
                <td class="px-6 py-4">
                    <span class="bg-slate-800 border border-slate-700 px-2 py-1 rounded text-xs text-slate-300 font-bold uppercase">${escHtml(sale.paymentMethod || 'CASH')}</span>
                </td>
                <td class="px-6 py-4 text-right font-mono font-bold text-emerald-400">${formatCurrency(sale.totalPrice)}</td>
                <td class="px-6 py-4 text-center">
                    <button class="text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-blue-500/20 block mx-auto">
                        View
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.invoice-row').forEach((row) => {
        row.addEventListener('click', () => {
            viewInvoice(row.dataset.saleId);
        });
    });
}

async function viewInvoice(id) {
    const sale = allSales.find(s => String(s.id) === String(id));
    if(!sale) return;
    currentViewingSaleId = id;
    currentViewingSale = sale;
    const receiptMoment = formatReceiptDateParts(sale.timestampIso || sale.timestamp);

    // Fetch items
    const items = await getSaleItemsBySaleId(id);

    // Populate standard details
    setTextIfPresent('detReceiptId', sale.receiptId);
    setTextIfPresent('detDate', receiptMoment.date);
    setTextIfPresent('detTime', receiptMoment.time);
    setTextIfPresent('detEmployee', `#${sale.employeeId || '-'}`);

    // Populate prices
    const subtotal = sale.totalPrice + (sale.discount || 0);
    setTextIfPresent('detSubtotal', formatReceiptAmount(subtotal));
    setTextIfPresent('detDiscount', formatReceiptAmount(sale.discount || 0));
    setTextIfPresent('detTotal', formatReceiptAmount(sale.totalPrice));
    const settlement = getSettlementSummary(sale.changeAmount);
    setTextIfPresent('detReceived', formatReceiptAmount(Number(sale.amountReceived ?? sale.totalPrice ?? 0)));
    setTextIfPresent('detSettlementLabel', settlement.label);
    setTextIfPresent('detChange', formatReceiptAmount(settlement.amount));

    const discountRow = document.getElementById('detDiscountRow');
    if (discountRow) {
        discountRow.classList.toggle('hidden', !(sale.discount > 0));
    }

    // Populate items
    if(items && items.length > 0) {
        document.getElementById('detItemsTable').innerHTML = items.map(item => `
            <div class="receipt-item-row">
                <span class="receipt-item-name">${escHtml(item.itemName || item.name || 'Item')}</span>
                <span class="receipt-item-qty">${escHtml(String(item.quantity || 0))}</span>
                <span class="receipt-item-amount">${formatReceiptAmount(item.totalPrice || ((item.unitPrice || item.price || 0) * Number(item.quantity || 0)))}</span>
            </div>
        `).join('');
    } else {
        document.getElementById('detItemsTable').innerHTML = `<div class="receipt-center-line italic text-slate-500">No items recorded (legacy data).</div>`;
    }

    // Void Status UI
    const isVoided = sale.status === 'voided';
    document.getElementById('voidStamp').classList.toggle('hidden', !isVoided);
    document.getElementById('btnVoidInvoice').style.display = isVoided ? 'none' : 'flex';
    const annotationInput = document.getElementById('saleAnnotationInput');
    if (annotationInput) annotationInput.value = sale.notes || '';
    setSaleAnnotationStatus(sale.notes ? 'Saved note loaded for this sale.' : 'No note saved for this sale yet.');

    // Open slide panel
    document.getElementById('invoicePanelWrapper').classList.remove('pointer-events-none', 'opacity-0');
    setTimeout(() => document.getElementById('invoicePanel').classList.add('open'), 10);
}

function closeInvoice() {
    document.getElementById('invoicePanel').classList.remove('open');
    currentViewingSale = null;
    currentViewingSaleId = null;
    setTimeout(() => {
        document.getElementById('invoicePanelWrapper').classList.add('pointer-events-none', 'opacity-0');
    }, 300);
}

function printInvoice() {
    window.print();
}

function getSettlementSummary(changeAmount) {
    const numericChange = Number(changeAmount ?? 0);
    if (numericChange < 0) {
        return {
            label: 'Due',
            amount: Math.abs(numericChange)
        };
    }

    return {
        label: 'Change',
        amount: numericChange
    };
}

async function voidInvoiceAction() {
    if(!currentViewingSaleId) return;
    const sale = allSales.find(s => s.id === currentViewingSaleId);
    
    if(!confirm(`Are you SURE you want to void receipt ${sale.receiptId}?\nThis cannot be undone and will mark the revenue as voided.`)) return;

    try {
        const updatedSale = await updateSaleRecord(sale.id, { status: 'voided' });
        Object.assign(sale, normalizeSaleRecord(updatedSale));
        
        // Refresh local memory and UI
        closeInvoice();
        filterInvoices();
        alert(`Receipt ${sale.receiptId} has been successfully voided.`);
        
        // Note: In a full enterprise system, this should also return stock to inventory.
        // For simple pos, marking status is sufficient for reporting.
    } catch(e) {
        console.error("Void error:", e);
        alert("Failed to void receipt.");
    }
}

async function saveSaleAnnotation() {
    if (!currentViewingSaleId) {
        setSaleAnnotationStatus('Open a sale first before saving a note.', 'error');
        return;
    }

    const input = document.getElementById('saleAnnotationInput');
    const notes = (input?.value || '').trim();

    try {
        const updatedSale = await updateSaleRecord(currentViewingSaleId, { notes });
        const normalized = normalizeSaleRecord(updatedSale);
        const sale = allSales.find((entry) => String(entry.id) === String(currentViewingSaleId));
        if (sale) Object.assign(sale, normalized);
        currentViewingSale = sale || normalized;
        setSaleAnnotationStatus(notes ? 'Annotation saved successfully.' : 'Annotation cleared.', 'success');
    } catch (error) {
        console.error('Failed to save sale annotation:', error);
        setSaleAnnotationStatus(error?.message || 'Failed to save annotation.', 'error');
    }
}

function exportToCSV() {
    if(filteredSales.length === 0) {
        alert("No data to export.");
        return;
    }

    const headers = ["Receipt ID", "Date", "Status", "Cashier ID", "Customer Name", "Payment Method", "Total Price (Rs)"];
    const rows = filteredSales.map(s => [
        s.receiptId,
        s.timestampIso || '',
        s.status || 'completed',
        s.employeeId || '',
        s.customerName || 'Walk-in',
        s.paymentMethod || 'CASH',
        s.totalPrice.toFixed(2)
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n"
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Invoice_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Start
init();
