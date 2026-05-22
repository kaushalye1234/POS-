// =============================================
// Fashion Shaa POS - Analytics Dashboard
// =============================================

let currentTab = 'daily';
let currentDate = new Date();
let salesChart = null;

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

async function initializeCurrentPeriodFromSales() {
    try {
        const sales = await getAllSales();
        if (!sales.length) {
            setAnalyticsStatus('No sales records found yet. Add a sale from the POS to populate analytics.', 'warning');
            return;
        }

        const latestSaleDate = sales
            .map(getSaleDateObject)
            .filter(Boolean)
            .sort((a, b) => b - a)[0];

        if (latestSaleDate) {
            currentDate = latestSaleDate;
            setAnalyticsStatus(`Connected to sales data. Showing the latest recorded period from ${latestSaleDate.toLocaleDateString('en-LK')}.`, 'success');
        }
    } catch (error) {
        console.warn('Could not initialize analytics period from sales data:', error);
        setAnalyticsStatus(error?.message || 'Could not load analytics data from the database.', 'error');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    await initializeCurrentPeriodFromSales();
    setupEventListeners();
    loadData();
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

// Load data based on current tab
async function loadData() {
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
        const sales = await getSalesByDateRange(startDate, endDate);
        updateStats(sales);
        updateChart(sales);
        updatePerformanceTable(sales);
        updateTransactionsTable(sales);
        if (sales.length === 0) {
            setAnalyticsStatus(`No sales were recorded for ${document.getElementById('currentPeriod').textContent}.`, 'warning');
        } else {
            setAnalyticsStatus(`Loaded ${sales.length} sale${sales.length === 1 ? '' : 's'} for ${document.getElementById('currentPeriod').textContent}.`, 'success');
        }
    } catch (err) {
        console.error('Failed to load data:', err);
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
        <tr>
            <td style="text-align: left;">${escapeHtml(item.itemName)}</td>
            <td style="text-align: right;">${formatCurrency(item.unitPrice)}</td>
            <td style="text-align: center; font-weight: 600;">${item.quantity}</td>
            <td style="text-align: right; font-weight: bold;">${formatCurrency(item.totalPrice)}</td>
        </tr>
    `).join('');

    const netAmount = sale.subTotal || sale.totalAmount;
    const discount = sale.discount || 0;

    invoiceContent.innerHTML = `
        <div style="background: var(--bg-input); padding: 20px; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px dashed var(--border);">
                <div class="brand-logo" style="display: inline-flex; margin-bottom: 10px;">
                    <span class="brand-fashion">FASHION</span>
                    <span class="brand-shaa">SHAA</span>
                </div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    188, Kachcheri Idiripita,<br>
                    Kada 12, Anuradhapura.<br>
                    Tel: 025 2053465
                </div>
            </div>
            
            <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 2px dashed var(--border);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="color: var(--text-secondary);">Sale ID:</span>
                    <span style="font-weight: 600;">#${sale._id || sale.id}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="color: var(--text-secondary);">Date:</span>
                    <span>${sale.saleDate}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="color: var(--text-secondary);">Time:</span>
                    <span>${sale.saleTime}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Employee:</span>
                    <span>${sale.employeeId}</span>
                </div>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border);">
                        <th style="text-align: left; padding: 8px 0; color: var(--text-secondary); font-size: 0.875rem;">PRODUCT</th>
                        <th style="text-align: right; padding: 8px 0; color: var(--text-secondary); font-size: 0.875rem;">PRICE</th>
                        <th style="text-align: center; padding: 8px 0; color: var(--text-secondary); font-size: 0.875rem;">QTY</th>
                        <th style="text-align: right; padding: 8px 0; color: var(--text-secondary); font-size: 0.875rem;">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            
            <div style="border-top: 2px dashed var(--border); padding-top: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Items:</span>
                    <span>${items.length}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Total Quantity:</span>
                    <span>${items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Net Amount:</span>
                    <span>${formatCurrency(netAmount)}</span>
                </div>
                ${discount > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: var(--success);">
                    <span>Discount (5%):</span>
                    <span>-${formatCurrency(discount)}</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 1.25rem; font-weight: 700;">
                    <span>TOTAL:</span>
                    <span style="color: var(--primary);">${formatCurrency(sale.totalAmount)}</span>
                </div>
            </div>
        </div>
    `;
}

// Close invoice modal
function closeInvoiceModal() {
    document.getElementById('invoiceModal').classList.remove('active');
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
});
