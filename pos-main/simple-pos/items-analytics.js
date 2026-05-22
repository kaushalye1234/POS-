// =============================================
// Item Analytics Module
// =============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function formatCurrency(amount) {
    return `Rs.${Number(amount || 0).toLocaleString('en-LK')}`;
}

// Get aggregated statistics for all items
async function getAllItemStats() {
    const allSaleItems = await getAllSaleItems();
    const stats = {};

    // Aggregate data by SKU (itemName can be duplicated)
    allSaleItems.forEach(item => {
        const sku = item.sku || item.itemName;
        if (!sku) return;

        if (!stats[sku]) {
            stats[sku] = {
                sku,
                name: item.itemName,
                timesSold: 0,
                revenue: 0,
                lastSoldDate: null
            };
        }
        stats[sku].timesSold += (item.quantity || 0);
        stats[sku].revenue += (item.totalPrice || 0);

        const d = item.saleDate || null;
        if (d && (!stats[sku].lastSoldDate || d > stats[sku].lastSoldDate)) {
            stats[sku].lastSoldDate = d;
        }
    });

    return stats;
}

// Render item analytics dashboard
async function renderItemAnalytics(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const statsMap = await getAllItemStats();
    const items = Object.values(statsMap);

    if (items.length === 0) {
        container.innerHTML = `
            <div class="glass rounded-2xl border border-white/10 shadow-xl px-6 py-6 lg:col-span-4">
                <div class="flex items-start gap-4">
                    <div class="h-12 w-12 rounded-2xl bg-slate-800/80 border border-white/10 flex items-center justify-center">
                        <span class="material-symbols-outlined text-slate-300">inventory_2</span>
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-white">Inventory Performance</p>
                        <p class="text-sm text-slate-400 mt-1">Sales-driven item insights will appear here after the first completed sales are recorded.</p>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // Calculate metrics
    const totalItemsSold = items.reduce((sum, item) => sum + item.timesSold, 0);
    const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);
    const trackedItems = items.length;

    // Most Sold
    const sortedBySold = [...items].sort((a, b) => b.timesSold - a.timesSold);
    const mostSold = sortedBySold[0];

    // Most Revenue
    const sortedByRevenue = [...items].sort((a, b) => b.revenue - a.revenue);
    const topRevenueItem = sortedByRevenue[0];

    const mostSoldShare = totalItemsSold > 0 ? Math.round((mostSold.timesSold / totalItemsSold) * 100) : 0;
    const avgRevenuePerItem = trackedItems > 0 ? totalRevenue / trackedItems : 0;

    const html = `
        <div class="glass rounded-2xl border border-white/10 shadow-xl overflow-hidden relative min-h-[196px]">
            <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-rose-400 to-amber-300"></div>
            <div class="p-6 h-full flex flex-col justify-between">
                <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                        <p class="text-xs font-semibold text-slate-400 uppercase">Inventory Performance</p>
                        <h2 class="text-2xl font-bold text-white mt-2">All-time item movement</h2>
                    </div>
                    <div class="h-12 w-12 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-primary">monitoring</span>
                    </div>
                </div>

                <div class="mt-8 flex items-end justify-between gap-4">
                    <div>
                        <p class="text-sm text-slate-400">Total items sold</p>
                        <p class="text-4xl font-black text-white mt-1">${totalItemsSold.toLocaleString('en-LK')}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-slate-500">Tracked SKUs</p>
                        <p class="text-lg font-semibold text-slate-200 mt-1">${trackedItems.toLocaleString('en-LK')}</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="glass rounded-2xl border border-white/10 shadow-xl overflow-hidden relative min-h-[196px]">
            <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-400 to-rose-500"></div>
            <div class="p-6 h-full flex flex-col justify-between">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <p class="text-xs font-semibold text-slate-400 uppercase">Most Sold Item</p>
                        <p class="text-lg font-bold text-white mt-2 break-words">${escapeHtml(mostSold.name || 'Unnamed Item')}</p>
                    </div>
                    <div class="h-11 w-11 rounded-2xl bg-orange-500/15 border border-orange-400/20 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-orange-300">local_fire_department</span>
                    </div>
                </div>

                <div class="mt-6 flex items-end justify-between gap-4">
                    <div>
                        <p class="text-3xl font-black text-white">${mostSold.timesSold.toLocaleString('en-LK')}</p>
                        <p class="text-sm text-slate-400 mt-1">units sold</p>
                    </div>
                    <div class="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-300">
                        ${mostSoldShare}% of volume
                    </div>
                </div>
            </div>
        </div>

        <div class="glass rounded-2xl border border-white/10 shadow-xl overflow-hidden relative min-h-[196px]">
            <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 to-indigo-500"></div>
            <div class="p-6 h-full flex flex-col justify-between">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <p class="text-xs font-semibold text-slate-400 uppercase">Top Revenue Item</p>
                        <p class="text-lg font-bold text-white mt-2 break-words">${escapeHtml(topRevenueItem.name || 'Unnamed Item')}</p>
                    </div>
                    <div class="h-11 w-11 rounded-2xl bg-sky-500/15 border border-sky-400/20 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-sky-300">diamond</span>
                    </div>
                </div>

                <div class="mt-6">
                    <p class="text-3xl font-black text-white">${formatCurrency(topRevenueItem.revenue)}</p>
                    <p class="text-sm text-slate-400 mt-1">generated by this item</p>
                </div>
            </div>
        </div>

        <div class="glass rounded-2xl border border-white/10 shadow-xl overflow-hidden relative min-h-[196px]">
            <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
            <div class="p-6 h-full flex flex-col justify-between">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <p class="text-xs font-semibold text-slate-400 uppercase">Total Revenue</p>
                        <p class="text-lg font-bold text-white mt-2">Sales contribution</p>
                    </div>
                    <div class="h-11 w-11 rounded-2xl bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-emerald-300">payments</span>
                    </div>
                </div>

                <div class="mt-6">
                    <p class="text-3xl font-black text-white">${formatCurrency(totalRevenue)}</p>
                    <p class="text-sm text-slate-400 mt-1">Avg per SKU ${formatCurrency(avgRevenuePerItem)}</p>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// Helper to get stats for a specific item (for the table)
async function getItemStats(sku) {
    const statsMap = await getAllItemStats();
    return statsMap[sku] || { timesSold: 0, revenue: 0, lastSoldDate: null };
}
