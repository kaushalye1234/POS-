// top-performing.js
// Logic for displaying ranked lists and bar charts for top products and categories

let advancedData = null;
let currentMetric = 'units'; // 'units' | 'revenue' | 'profit'
let itemsChartInstance = null;
let catsChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    await fetchPerformanceData();
    setupTabListeners();
});

async function fetchPerformanceData() {
    try {
        const response = await fetchAPI('/sales/analytics/advanced');
        advancedData = response;
        renderRankings();
    } catch (err) {
        console.error('Failed to load performance data:', err);
    }
}

function setupTabListeners() {
    const tabUnits = document.getElementById('tabUnits');
    const tabRevenue = document.getElementById('tabRevenue');
    const tabProfit = document.getElementById('tabProfit');

    function deactivateAll() {
        [tabUnits, tabRevenue, tabProfit].forEach(btn => {
            btn.className = 'px-6 py-2.5 rounded-lg font-bold text-sm transition-all text-slate-400 hover:text-white';
        });
    }

    tabUnits.addEventListener('click', () => {
        deactivateAll();
        tabUnits.className = 'px-6 py-2.5 rounded-lg font-bold text-sm transition-all bg-primary text-white';
        currentMetric = 'units';
        renderRankings();
    });

    tabRevenue.addEventListener('click', () => {
        deactivateAll();
        tabRevenue.className = 'px-6 py-2.5 rounded-lg font-bold text-sm transition-all bg-primary text-white';
        currentMetric = 'revenue';
        renderRankings();
    });

    tabProfit.addEventListener('click', () => {
        deactivateAll();
        tabProfit.className = 'px-6 py-2.5 rounded-lg font-bold text-sm transition-all bg-primary text-white';
        currentMetric = 'profit';
        renderRankings();
    });
}

function renderRankings() {
    if (!advancedData) return;

    const items = advancedData.items || [];
    const categories = advancedData.categories || [];

    // 1. Sort Data
    let sortedItems = [];
    let sortedCats = [];
    let metricHeader = '';
    let formatFn = (val) => val.toLocaleString();

    if (currentMetric === 'units') {
        sortedItems = [...items].sort((a, b) => b.units - a.units);
        sortedCats = [...categories].sort((a, b) => b.units - a.units);
        metricHeader = 'Units Sold';
        formatFn = (val) => `${val.toLocaleString()} units`;
    } else if (currentMetric === 'revenue') {
        sortedItems = [...items].sort((a, b) => b.revenue - a.revenue);
        sortedCats = [...categories].sort((a, b) => b.revenue - a.revenue);
        metricHeader = 'Revenue';
        formatFn = (val) => `Rs. ${val.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
    } else if (currentMetric === 'profit') {
        sortedItems = [...items].sort((a, b) => b.profit - a.profit);
        sortedCats = [...categories].sort((a, b) => b.profit - a.profit);
        metricHeader = 'Net Profit';
        formatFn = (val) => `Rs. ${val.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
    }

    // Update table headers
    document.getElementById('catMetricHeader').textContent = metricHeader;
    document.getElementById('itemMetricHeader').textContent = metricHeader;

    // 2. Render Tables
    const catTbody = document.getElementById('catsRankTableBody');
    if (sortedCats.length === 0) {
        catTbody.innerHTML = '<tr><td colspan="3" class="text-center p-6 text-slate-500 italic">No category sales records.</td></tr>';
    } else {
        catTbody.innerHTML = sortedCats.map((c, i) => {
            const val = currentMetric === 'units' ? c.units : (currentMetric === 'revenue' ? c.revenue : c.profit);
            return `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-3 py-3 font-bold text-slate-500">#${i + 1}</td>
                    <td class="px-3 py-3 font-semibold text-white">${escapeHtml(c.category)}</td>
                    <td class="px-3 py-3 text-right text-slate-300 font-bold">${formatFn(val)}</td>
                </tr>
            `;
        }).join('');
    }

    const itemTbody = document.getElementById('itemsRankTableBody');
    if (sortedItems.length === 0) {
        itemTbody.innerHTML = '<tr><td colspan="5" class="text-center p-10 text-slate-500 italic">No product sales records.</td></tr>';
    } else {
        itemTbody.innerHTML = sortedItems.map((item, i) => {
            const val = currentMetric === 'units' ? item.units : (currentMetric === 'revenue' ? item.revenue : item.profit);
            return `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-4 py-3 font-bold text-slate-500">#${i + 1}</td>
                    <td class="px-4 py-3 font-mono text-slate-300 font-bold">${item.sku}</td>
                    <td class="px-4 py-3 font-semibold text-white">${escapeHtml(item.name)}</td>
                    <td class="px-4 py-3 text-slate-400">${escapeHtml(item.category)}</td>
                    <td class="px-4 py-3 text-right text-secondary font-bold">${formatFn(val)}</td>
                </tr>
            `;
        }).join('');
    }

    // 3. Render Charts
    renderCharts(sortedItems.slice(0, 5), sortedCats.slice(0, 5));
}

function renderCharts(top5Items, top5Cats) {
    const itemLabels = top5Items.map(x => x.name.length > 15 ? `${x.name.slice(0, 12)}...` : x.name);
    const itemValues = top5Items.map(x => currentMetric === 'units' ? x.units : (currentMetric === 'revenue' ? x.revenue : x.profit));

    const catLabels = top5Cats.map(x => x.category);
    const catValues = top5Cats.map(x => currentMetric === 'units' ? x.units : (currentMetric === 'revenue' ? x.revenue : x.profit));

    // Update chart title elements
    const labelTitle = currentMetric === 'units' ? 'Units Sold' : (currentMetric === 'revenue' ? 'Revenue (Rs.)' : 'Net Profit (Rs.)');
    document.getElementById('itemsChartTitle').innerHTML = `<span class="material-symbols-outlined text-[18px] text-primary">analytics</span> Top 5 Products by ${labelTitle}`;
    document.getElementById('catsChartTitle').innerHTML = `<span class="material-symbols-outlined text-[18px] text-secondary">category</span> Top Categories by ${labelTitle}`;

    // Item Chart
    const ctxItems = document.getElementById('topItemsChart').getContext('2d');
    if (itemsChartInstance) itemsChartInstance.destroy();
    itemsChartInstance = new Chart(ctxItems, {
        type: 'bar',
        data: {
            labels: itemLabels,
            datasets: [{
                label: labelTitle,
                data: itemValues,
                backgroundColor: 'rgba(220, 38, 38, 0.85)',
                borderColor: '#dc2626',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });

    // Category Chart
    const ctxCats = document.getElementById('topCategoriesChart').getContext('2d');
    if (catsChartInstance) catsChartInstance.destroy();
    catsChartInstance = new Chart(ctxCats, {
        type: 'bar',
        data: {
            labels: catLabels,
            datasets: [{
                label: labelTitle,
                data: catValues,
                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                borderColor: '#10b981',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}
