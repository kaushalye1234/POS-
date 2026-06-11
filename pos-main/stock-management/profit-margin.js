// profit-margin.js
// Logic for displaying aggregate metrics, category breakdowns, and filterable product profit margins

let advancedData = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    await fetchMarginData();
    setupSearch();
});

async function fetchMarginData() {
    try {
        const response = await fetchAPI('/sales/analytics/advanced');
        advancedData = response;

        renderAggregateCards(response.financials);
        renderCategoryBreakdown(response.categories);
        renderItemsMargins(response.items);
    } catch (err) {
        console.error('Failed to load profit margin data:', err);
    }
}

// 1. Render Top level aggregate metrics
function renderAggregateCards(fin) {
    const revenue = fin.totalRevenue || 0;
    const profit = fin.totalGrossProfit || 0;
    const margin = fin.netProfitMargin || 0;

    document.getElementById('pmTotalRevenue').textContent = `Rs. ${revenue.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
    document.getElementById('pmTotalProfit').textContent = `Rs. ${profit.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
    document.getElementById('pmMargin').textContent = `${margin.toFixed(2)}%`;
}

// 2. Render Category table (Sorted by Net Margin descending)
function renderCategoryBreakdown(categories) {
    const tbody = document.getElementById('categoryTableBody');
    if (!categories || categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-slate-500 italic">No categories loaded.</td></tr>';
        return;
    }

    // Sort categories by margin descending
    const sorted = [...categories].map(c => {
        const rev = c.revenue || 0;
        const profit = c.profit || 0;
        const margin = rev > 0 ? (profit / rev) * 100 : 0;
        return { ...c, margin };
    }).sort((a, b) => b.margin - a.margin);

    tbody.innerHTML = sorted.map(c => {
        const rev = c.revenue || 0;
        const profit = c.profit || 0;
        return `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="px-3 py-3 font-semibold text-white">${escapeHtml(c.category)}</td>
                <td class="px-3 py-3 text-right text-slate-300">Rs. ${rev.toLocaleString('en-LK', { maximumFractionDigits: 0 })}</td>
                <td class="px-3 py-3 text-right text-secondary">Rs. ${profit.toLocaleString('en-LK', { maximumFractionDigits: 0 })}</td>
                <td class="px-3 py-3 text-center font-bold text-white">${c.margin.toFixed(1)}%</td>
            </tr>
        `;
    }).join('');
}

// 3. Render Item-level details table
function renderItemsMargins(items) {
    const tbody = document.getElementById('itemsMarginTableBody');
    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-10 text-slate-500 italic">No items found.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => {
        const cost = item.costPrice || 0;
        const price = item.price || 0;
        const markup = item.markup || 0;
        const margin = item.margin || 0;

        const marginClass = margin >= 15 ? 'text-secondary font-bold' : 'text-amber-500 font-bold';
        const markupClass = markup >= 20 ? 'text-secondary font-semibold' : 'text-amber-500 font-semibold';

        return `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="px-4 py-3 font-mono text-slate-300 font-bold">${item.sku}</td>
                <td class="px-4 py-3">
                    <p class="font-bold text-white leading-tight">${item.name}</p>
                    <p class="text-[10px] text-slate-500 mt-0.5">${item.category}</p>
                </td>
                <td class="px-4 py-3 text-right text-slate-300">Rs. ${cost.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                <td class="px-4 py-3 text-right text-slate-300">Rs. ${price.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                <td class="px-4 py-3 text-center ${markupClass}">${markup.toFixed(1)}%</td>
                <td class="px-4 py-3 text-center ${marginClass}">${margin.toFixed(1)}%</td>
            </tr>
        `;
    }).join('');
}

// 4. Local Table search/filter binding
function setupSearch() {
    const input = document.getElementById('itemSearch');
    input.addEventListener('input', (e) => {
        if (!advancedData) return;
        const query = e.target.value.toLowerCase().trim();
        const filtered = advancedData.items.filter(item => 
            item.sku.toLowerCase().includes(query) || 
            item.name.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
        );
        renderItemsMargins(filtered);
    });
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}
