// view-item.js
// Handles displaying single item details and loading the transaction audit log

document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    
    const urlParams = new URLSearchParams(window.location.search);
    const sku = urlParams.get('sku');
    
    if (!sku) {
        alert('Missing Product SKU parameter.');
        window.location.href = 'items.html';
        return;
    }
    
    loadProductDetails(sku);
    loadProductTransactions(sku);
    
    // Bind Edit Button
    document.getElementById('editProductBtn').addEventListener('click', () => {
        window.location.href = `add-item.html?editSku=${encodeURIComponent(sku)}`;
    });
});

async function loadProductDetails(sku) {
    try {
        const item = await getInventoryItem(sku);
        if (!item) {
            alert('Product SKU not found in database.');
            window.location.href = 'items.html';
            return;
        }

        // Title and badge
        document.title = `Fashion Shaa - Product Audit (${sku})`;
        document.getElementById('detailSkuBadge').textContent = item.sku;
        document.getElementById('detailProductName').textContent = item.name;
        document.getElementById('detailCategory').textContent = item.category || 'Other';
        
        // Prices
        const price = item.price || 0;
        const cost = item.costPrice || 0;
        const profit = price - cost;
        const margin = price > 0 ? (profit / price) * 100 : 0;
        
        document.getElementById('detailPrice').textContent = `Rs. ${price.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
        document.getElementById('detailCostPrice').textContent = `Rs. ${cost.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
        document.getElementById('detailProfit').textContent = `Rs. ${profit.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
        document.getElementById('detailMargin').textContent = `${margin.toFixed(2)}%`;
        
        // Thresholds and levels
        const stockLevel = item.stockLevel || 0;
        const stockEl = document.getElementById('detailStockLevel');
        stockEl.textContent = stockLevel;
        
        const lowThresh = item.lowStockThreshold !== undefined ? item.lowStockThreshold : 10;
        const critThresh = item.criticalStockThreshold !== undefined ? item.criticalStockThreshold : 3;
        
        document.getElementById('detailLowThresh').textContent = lowThresh;
        document.getElementById('detailCritThresh').textContent = critThresh;

        if (stockLevel <= critThresh) {
            stockEl.className = 'text-base font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded';
        } else if (stockLevel <= lowThresh) {
            stockEl.className = 'text-base font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded';
        } else {
            stockEl.className = 'text-base font-bold text-secondary bg-secondary/10 px-3 py-1 rounded';
        }

        // Image
        const img = document.getElementById('detailImage');
        const noImg = document.getElementById('detailNoImage');
        if (item.imageUrl) {
            img.src = item.imageUrl;
            img.classList.remove('hidden');
            noImg.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            noImg.classList.remove('hidden');
        }

        // Barcode
        const barcodeText = document.getElementById('detailBarcodeText');
        const barcodeImage = document.getElementById('detailBarcodeImage');
        if (item.barcode) {
            barcodeText.textContent = item.barcode;
            const renderData = await renderBarcodePng(item.barcode);
            if (renderData && renderData.pngBase64) {
                barcodeImage.innerHTML = `<img src="data:image/png;base64,${renderData.pngBase64}" class="mx-auto" alt="Barcode"/>`;
            } else {
                barcodeImage.textContent = '[Barcode Rendering Unavailable]';
            }
        } else {
            document.getElementById('detailBarcodeSection').classList.add('hidden');
        }
    } catch (err) {
        console.error('Failed to retrieve item details:', err);
    }
}

async function loadProductTransactions(sku) {
    try {
        const transactions = await fetchAPI(`/items/${encodeURIComponent(sku)}/transactions`);
        const tbody = document.getElementById('transactionTableBody');
        
        if (!transactions || transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center p-10 text-slate-500 italic">No transactions found for this product.</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(t => {
            const dateStr = new Date(t.createdAt).toLocaleString();
            const change = t.change || 0;
            const changeClass = change < 0 ? 'text-red-500 font-bold' : 'text-secondary font-bold';
            const changeText = change < 0 ? `${change}` : `+${change}`;
            
            const sourceMap = {
                sale: 'bg-red-500/10 text-red-500 border-red-500/20',
                return: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                restock: 'bg-secondary/10 text-secondary border-secondary/20',
                manual: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                adjustment: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                import: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
            };
            
            const sourceBadge = `<span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${sourceMap[t.source] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}">${t.source || 'manual'}</span>`;
            const price = t.priceUsed !== undefined ? `Rs. ${t.priceUsed.toLocaleString('en-LK', { minimumFractionDigits: 2 })}` : '—';
            const qty = t.quantity !== undefined ? t.quantity : Math.abs(change);

            return `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-6 py-4 text-slate-300 font-medium">${dateStr}</td>
                    <td class="px-6 py-4">${sourceBadge}</td>
                    <td class="px-6 py-4 text-center ${changeClass}">${changeText}</td>
                    <td class="px-6 py-4 text-center text-slate-300 font-semibold">${qty}</td>
                    <td class="px-6 py-4 text-slate-300">${price}</td>
                    <td class="px-6 py-4 text-slate-400 max-w-[200px] truncate" title="${escapeHtml(t.notes || '')}">${escapeHtml(t.notes || '—')}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Failed to load transaction audit trail:', err);
    }
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}
