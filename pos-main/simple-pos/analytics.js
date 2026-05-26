// =============================================
// Fashion Shaa POS - Analytics Dashboard
// =============================================

let currentTab = 'daily';
let currentDate = new Date();
let salesChart = null;
let authRedirectScheduled = false;
let latestRecordedSaleDate = null;
let analyticsRefreshTimer = null;
let salesRealtimeChannel = null;
let currentInvoiceSaleId = null;
let currentInvoiceSale = null;

function setAnalyticsStatus(message, type = 'info') {
    const status = document.getElementById('analyticsStatus');
    if (!status) return;

    if (!message) {
        status.className = 'hidden';
        status.textContent = '';
        return;
    }

    const typeClasses = {
        success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
        warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
        error: 'border-rose-500/40 bg-rose-500/10 text-rose-100',
        info: 'border-slate-600 bg-slate-800/60 text-slate-200'
    };

    status.className = `w-full max-w-[720px] rounded-xl border px-4 py-3 text-sm font-semibold ${typeClasses[type] || typeClasses.info}`;
    status.textContent = message;
}

function setInvoiceAnnotationStatus(message = '', tone = 'muted') {
    const element = document.getElementById('invoiceAnnotationStatus');
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

function getSaleDateObject(sale) {
    if (!sale) return null;

    if (sale.saleDate) {
        const [year, month, day] = String(sale.saleDate).split('-').map(Number);
        const [hours, minutes, seconds] = String(sale.saleTime || '00:00:00').split(':').map(Number);
        const parsed = new Date(
            year,
            (month || 1) - 1,
            day || 1,
            hours || 0,
            minutes || 0,
            seconds || 0
        );
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const fromCreatedAt = sale.createdAt || sale.timestamp;
    if (fromCreatedAt) {
        const parsed = new Date(fromCreatedAt);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
}

function formatAnalyticsDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-LK', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function isSamePeriod(a, b, tab = currentTab) {
    if (!(a instanceof Date) || Number.isNaN(a.getTime()) || !(b instanceof Date) || Number.isNaN(b.getTime())) {
        return false;
    }

    if (tab === 'daily') {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    if (tab === 'monthly') {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth();
    }

    return a.getFullYear() === b.getFullYear();
}

async function refreshLatestRecordedSaleDate() {
    const sales = await getAllSales();
    latestRecordedSaleDate = sales
        .map(getSaleDateObject)
        .filter(Boolean)
        .sort((a, b) => b - a)[0] || null;

    return latestRecordedSaleDate;
}

function isAuthError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('no token provided')
        || message.includes('access denied')
        || message.includes('session expired')
        || message.includes('unauthorized');
}

function redirectToPosLogin() {
    const targetUrl = new URL('index.html', window.location.href).href;

    if (window.top && window.top !== window) {
        window.top.location.replace(targetUrl);
        return;
    }

    window.location.replace(targetUrl);
}

function handleAnalyticsAuthFailure() {
    setAnalyticsStatus('Please sign in from the POS screen to view analytics. Redirecting now...', 'error');

    if (authRedirectScheduled) return true;
    authRedirectScheduled = true;

    window.setTimeout(() => {
        redirectToPosLogin();
    }, 900);

    return true;
}

async function initializeCurrentPeriodFromSales() {
    try {
        const latestSaleDate = await refreshLatestRecordedSaleDate();
        if (!latestSaleDate) {
            setAnalyticsStatus('No sales records found yet. Add a sale from the POS to populate analytics.', 'warning');
            return;
        }
    } catch (error) {
        console.warn('Could not initialize analytics period from sales data:', error);
        if (isAuthError(error)) {
            handleAnalyticsAuthFailure();
            return;
        }
        setAnalyticsStatus(error?.message || 'Could not load analytics data from the database.', 'error');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    if (window.POS_API?.isAuthenticated && !window.POS_API.isAuthenticated()) {
        handleAnalyticsAuthFailure();
        return;
    }

    await initDatabase();
    await initializeCurrentPeriodFromSales();
    setupEventListeners();
    setupRealtimeSalesRefresh();
    loadData();
    startAnalyticsAutoRefresh();
});

// Setup event listeners
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            loadData();
        });
    });

    // Period navigation
    document.getElementById('prevPeriod').addEventListener('click', () => {
        navigatePeriod(-1);
    });
    document.getElementById('nextPeriod').addEventListener('click', () => {
        navigatePeriod(1);
    });
}

// Navigate between periods
function navigatePeriod(direction) {
    if (currentTab === 'daily') {
        currentDate.setDate(currentDate.getDate() + direction);
    } else if (currentTab === 'monthly') {
        currentDate.setMonth(currentDate.getMonth() + direction);
    } else if (currentTab === 'yearly') {
        currentDate.setFullYear(currentDate.getFullYear() + direction);
    }
    loadData();
}

function startAnalyticsAutoRefresh() {
    if (analyticsRefreshTimer) return;

    analyticsRefreshTimer = window.setInterval(() => {
        if (document.hidden) return;
        loadData({ refreshLatestSaleDate: true });
    }, 30000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadData({ refreshLatestSaleDate: true });
        }
    });

    window.addEventListener('focus', () => {
        loadData({ refreshLatestSaleDate: true });
    });
}

function refreshAnalyticsFromExternalSale() {
    if (authRedirectScheduled || document.hidden) return;
    loadData({ refreshLatestSaleDate: true });
}

function setupRealtimeSalesRefresh() {
    const eventKey = window.POS_API?.SALES_SYNC_EVENT_KEY || 'pos_last_sale_event';
    const channelName = window.POS_API?.SALES_SYNC_CHANNEL || 'fashion-shaa-pos-sync';

    window.addEventListener('storage', (event) => {
        if (event.key !== eventKey || !event.newValue) return;
        refreshAnalyticsFromExternalSale();
    });

    if ('BroadcastChannel' in window) {
        try {
            salesRealtimeChannel = new BroadcastChannel(channelName);
            salesRealtimeChannel.addEventListener('message', (event) => {
                if (event?.data?.type !== 'sale-recorded') return;
                refreshAnalyticsFromExternalSale();
            });
        } catch (error) {
            console.warn('Realtime sales refresh channel unavailable:', error);
        }
    }
}

// Load data based on current tab
async function loadData({ refreshLatestSaleDate: shouldRefreshLatest = false } = {}) {
    updatePeriodDisplay();

    let startDate, endDate;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const day = currentDate.getDate();

    if (currentTab === 'daily') {
        startDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        endDate = startDate;
    } else if (currentTab === 'monthly') {
        startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    } else if (currentTab === 'yearly') {
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
    }

    try {
        if (shouldRefreshLatest || !latestRecordedSaleDate) {
            await refreshLatestRecordedSaleDate();
        }
        const sales = await getSalesByDateRange(startDate, endDate);
        updateStats(sales);
        updateChart(sales);
        updatePerformanceTable(sales);
        updateTransactionsTable(sales);
        if (sales.length === 0) {
            const periodLabel = document.getElementById('currentPeriod').textContent;
            if (latestRecordedSaleDate && !isSamePeriod(latestRecordedSaleDate, currentDate, currentTab)) {
                setAnalyticsStatus(`No sales were recorded for ${periodLabel}. Latest recorded sales were on ${formatAnalyticsDate(latestRecordedSaleDate)}.`, 'warning');
            } else {
                setAnalyticsStatus(`No sales were recorded for ${periodLabel}.`, 'warning');
            }
        } else {
            setAnalyticsStatus(`Loaded ${sales.length} sale${sales.length === 1 ? '' : 's'} for ${document.getElementById('currentPeriod').textContent}.`, 'success');
        }
    } catch (err) {
        console.error('Failed to load data:', err);
        if (isAuthError(err)) {
            handleAnalyticsAuthFailure();
            return;
        }
        setAnalyticsStatus(err?.message || 'Failed to load analytics data from the database.', 'error');
    }
}

// Update period display
function updatePeriodDisplay() {
    const periodDisplay = document.getElementById('currentPeriod');
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    if (currentTab === 'daily') {
        periodDisplay.textContent = currentDate.toLocaleDateString('en-LK', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    } else if (currentTab === 'monthly') {
        periodDisplay.textContent = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else if (currentTab === 'yearly') {
        periodDisplay.textContent = `Year ${currentDate.getFullYear()}`;
    }
}

// Format currency
function formatCurrency(amount) {
    return 'Rs.' + amount.toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatReceiptAmount(amount) {
    return Number(amount || 0).toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatReceiptDateValue(rawDate) {
    if (!rawDate) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawDate))) {
        const [year, month, day] = String(rawDate).split('-');
        return `${day}/${month}/${year}`;
    }

    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return '-';
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
}

// Update stats cards
function updateStats(sales) {
    const totalSales = sales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
    const totalTransactions = sales.length;
    const totalItems = sales.reduce((sum, s) => sum + Number(s.itemsCount || (s.items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0)), 0);
    const avgSale = totalTransactions > 0 ? totalSales / totalTransactions : 0;

    document.getElementById('totalSales').textContent = formatCurrency(totalSales);
    document.getElementById('totalTransactions').textContent = totalTransactions;
    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('avgSale').textContent = formatCurrency(avgSale);
}

// Update sales chart
function updateChart(sales) {
    const ctx = document.getElementById('salesChart').getContext('2d');

    // Group sales by period
    const groupedData = {};
    sales.forEach(sale => {
        let key;
        if (currentTab === 'daily') {
            key = sale.saleTime.substring(0, 2) + ':00'; // Group by hour
        } else if (currentTab === 'monthly') {
            key = sale.saleDate.substring(8, 10); // Group by day
        } else {
            key = sale.saleDate.substring(5, 7); // Group by month
        }

        if (!groupedData[key]) {
            groupedData[key] = 0;
        }
        groupedData[key] += Number(sale.totalAmount || 0);
    });

    const labels = Object.keys(groupedData).sort();
    const data = labels.map(l => groupedData[l]);

    if (salesChart) {
        salesChart.destroy();
    }

    salesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales (Rs.)',
                data: data,
                backgroundColor: 'rgba(99, 102, 241, 0.7)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#94a3b8'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#94a3b8'
                    }
                }
            }
        }
    });
}

// Update employee performance table
function updatePerformanceTable(sales) {
    const tbody = document.getElementById('performanceTableBody');

    // Group by employee
    const performance = {};
    sales.forEach(sale => {
        if (!performance[sale.employeeId]) {
            performance[sale.employeeId] = {
                id: sale.employeeId,
                transactions: 0,
                totalSales: 0,
                items: 0
            };
        }
        performance[sale.employeeId].transactions++;
        performance[sale.employeeId].totalSales += Number(sale.totalAmount || 0);
        performance[sale.employeeId].items += Number(sale.itemsCount || (sale.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    });

    const rows = Object.values(performance).sort((a, b) => b.totalSales - a.totalSales);

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No data for this period</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(emp => `
        <tr>
            <td>${emp.id}</td>
            <td>${emp.transactions}</td>
            <td>${formatCurrency(emp.totalSales)}</td>
            <td>${emp.items}</td>
            <td>${formatCurrency(emp.transactions > 0 ? emp.totalSales / emp.transactions : 0)}</td>
        </tr>
    `).join('');
}

// Update transactions table
function updateTransactionsTable(sales) {
    const tbody = document.getElementById('transactionsTableBody');

    const recentSales = sales.slice(-20).reverse(); // Last 20 transactions

    if (recentSales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No transactions for this period</td></tr>';
        return;
    }

    tbody.innerHTML = recentSales.map(sale => `
        <tr class="transaction-row-clickable" data-sale-id="${sale._id || sale.id}">
            <td>${sale.saleDate}</td>
            <td>${sale.saleTime}</td>
            <td>${sale.employeeId}</td>
            <td>${sale.itemsCount || (sale.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</td>
            <td>${formatCurrency(Number(sale.totalAmount || 0))}</td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.transaction-row-clickable').forEach((row) => {
        row.addEventListener('click', () => {
            viewInvoice(row.dataset.saleId);
        });
    });
}

// View invoice for a specific sale
async function viewInvoice(saleId) {
    try {
        // Fetch sale details from the full sales list
        const allSales = await getAllSales();
        const sale = allSales.find(s => String(s._id || s.id) === String(saleId));

        if (!sale) {
            alert('Sale not found');
            return;
        }

        // Fetch sale items
        const items = await getSaleItemsBySaleId(saleId);
        currentInvoiceSaleId = String(sale._id || sale.id);
        currentInvoiceSale = sale;

        // Render invoice modal
        renderInvoiceModal(sale, items);

        // Show modal
        document.getElementById('invoiceModal').classList.add('active');
    } catch (err) {
        console.error('Failed to load invoice:', err);
        alert('Failed to load invoice details');
    }
}

// Render invoice modal content
function renderInvoiceModal(sale, items) {
    const invoiceContent = document.getElementById('invoiceContent');

    const itemsHtml = items.map(item => `
        <div class="receipt-item-row">
            <span class="receipt-item-name">${escapeHtml(item.itemName || item.name || 'Item')}</span>
            <span class="receipt-item-qty">${escapeHtml(String(item.quantity || 0))}</span>
            <span class="receipt-item-amount">${formatReceiptAmount(item.totalPrice)}</span>
        </div>
    `).join('');

    const netAmount = Number(sale.subTotal || sale.totalAmount || 0);
    const discount = sale.discount || 0;
    const amountReceived = Number(sale.amountReceived ?? sale.totalAmount ?? 0);
    const changeAmount = Number(sale.changeAmount ?? 0);
    const settlementLabel = changeAmount < 0 ? 'Due' : 'Change';
    const settlementAmount = Math.abs(changeAmount);

    invoiceContent.innerHTML = `
        <div class="receipt-paper rounded-lg">
            <div class="receipt-logo">
                <span class="receipt-logo-block receipt-logo-red">FASHION</span>
                <span class="receipt-logo-block receipt-logo-black">SHAA</span>
            </div>
            <div class="receipt-text">
                <div class="receipt-separator">========================================</div>
                <div class="receipt-center-line">Textiles &amp; Readymade Garments</div>
                <div class="receipt-center-line">188, Kachcheri Idiripita,</div>
                <div class="receipt-center-line">Kada 12, Anuradhapura.</div>
                <div class="receipt-center-line">Tel: 025 2053465</div>
                <div class="receipt-separator">========================================</div>
                <div class="receipt-title">SALES RECEIPT</div>

                <div class="receipt-meta-row">
                    <span>Date: ${escapeHtml(formatReceiptDateValue(sale.saleDate || '-'))}</span>
                    <span>Time: ${escapeHtml(sale.saleTime || '-')}</span>
                </div>
                <div class="receipt-meta-row">
                    <span>Employee: #${escapeHtml(sale.employeeId || '-')}</span>
                    <span>Receipt: ${escapeHtml(sale.receiptId || sale.id || '-')}</span>
                </div>

                <div class="receipt-separator">----------------------------------------</div>
                <div class="receipt-items-header">
                    <span>ITEM</span>
                    <span>QTY</span>
                    <span>TOTAL</span>
                </div>
                ${itemsHtml || '<div class="receipt-center-line">No items recorded.</div>'}

                <div class="receipt-separator">----------------------------------------</div>
                <div class="receipt-summary-row">
                    <span>Subtotal:</span>
                    <span>${formatReceiptAmount(netAmount)}</span>
                </div>
                ${discount > 0 ? `
                <div class="receipt-summary-row">
                    <span>Discount:</span>
                    <span>-${formatReceiptAmount(discount)}</span>
                </div>
                ` : ''}
                <div class="receipt-total-row">
                    <span>TOTAL:</span>
                    <span>${formatReceiptAmount(sale.totalAmount)}</span>
                </div>
                <div class="receipt-summary-row">
                    <span>Amount Received:</span>
                    <span>${formatReceiptAmount(amountReceived)}</span>
                </div>
                <div class="receipt-summary-row">
                    <span>${settlementLabel}:</span>
                    <span>${formatReceiptAmount(settlementAmount)}</span>
                </div>
                <div class="receipt-separator">========================================</div>
                <div class="receipt-footer">THANK YOU!</div>
                <div class="receipt-footer">COME AGAIN!</div>
            </div>
        </div>
    `;

    const annotationInput = document.getElementById('invoiceAnnotationInput');
    if (annotationInput) {
        annotationInput.value = sale.notes || '';
    }
    setInvoiceAnnotationStatus(sale.notes ? 'Saved note loaded for this sale.' : 'No note saved for this sale yet.');
}

// Close invoice modal
function closeInvoiceModal() {
    document.getElementById('invoiceModal').classList.remove('active');
    currentInvoiceSaleId = null;
    currentInvoiceSale = null;
    setInvoiceAnnotationStatus('');
}

async function saveInvoiceAnnotation() {
    if (!currentInvoiceSaleId) {
        setInvoiceAnnotationStatus('Open a sale before saving an annotation.', 'error');
        return;
    }

    const input = document.getElementById('invoiceAnnotationInput');
    const notes = (input?.value || '').trim();

    try {
        const updatedSale = await updateSaleRecord(currentInvoiceSaleId, { notes });
        currentInvoiceSale = updatedSale;
        setInvoiceAnnotationStatus(notes ? 'Annotation saved successfully.' : 'Annotation cleared.', 'success');
    } catch (error) {
        console.error('Failed to save invoice annotation:', error);
        setInvoiceAnnotationStatus(error?.message || 'Failed to save annotation.', 'error');
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Setup modal close handlers
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('closeInvoiceModal').addEventListener('click', closeInvoiceModal);
    document.getElementById('invoiceModal').addEventListener('click', (e) => {
        if (e.target.id === 'invoiceModal') closeInvoiceModal();
    });
    document.getElementById('saveInvoiceAnnotationBtn').addEventListener('click', saveInvoiceAnnotation);
});
