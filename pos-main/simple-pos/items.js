// =============================================
// Fashion Shaa POS - Item Management Logic
// =============================================

let isEditing = false;
let editingSku = null;
let currentImageDataUrl = '';

function parseNumericIdFromSku(sku) {
    const m = String(sku || '').match(/^ITM-(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
}

function isDigits(str) {
    return /^\d+$/.test(String(str || ''));
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDatabase();
        await loadItems();
        setupEventListeners();

        // Render Analytics Dashboard
        if (typeof renderItemAnalytics === 'function') {
            await renderItemAnalytics('itemAnalytics');
        }
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Database Error: ' + (error.message || error));
    }
});

function setupEventListeners() {
    document.getElementById('saveItemBtn')?.addEventListener('click', handleSaveItem);
    document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);

    document.getElementById('itemImage')?.addEventListener('change', handleImageSelected);

    document.getElementById('generateBarcodeBtn')?.addEventListener('click', handleGenerateBarcode);
    document.getElementById('printBarcodeBtn')?.addEventListener('click', handlePrintBarcode);
}

async function loadItems() {
    try {
        const items = await getAllInventoryItems();
        const tbody = document.getElementById('itemsTableBody');

        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 30px; color: var(--text-secondary);">No items found. Add your first item on the left.</td></tr>';
            return;
        }

        // Get analytics data once
        let statsMap = {};
        if (typeof getAllItemStats === 'function') {
            statsMap = await getAllItemStats();
        }

        items.sort((a, b) => {
            const ai = parseNumericIdFromSku(a.sku);
            const bi = parseNumericIdFromSku(b.sku);
            if (ai !== null && bi !== null) return ai - bi;
            return String(a.sku || '').localeCompare(String(b.sku || ''));
        });

        tbody.innerHTML = items.map(item => {
            const stats = statsMap[item.sku] || statsMap[item.name] || { timesSold: 0, revenue: 0, lastSoldDate: null };
            const displayId = parseNumericIdFromSku(item.sku);
            const idText = displayId !== null ? `#${displayId}` : (item.sku || '');
            const skuText = item.sku || '';

            const price = Number(item.price || 0);
            const stock = Number(item.stockLevel || 0);
            const storedAt = item.storedAt || item.createdAt || null;
            const storedText = storedAt ? new Date(storedAt).toISOString().slice(0, 10) : '';

            const lowStockStyle = stock <= 5 ? 'background:rgba(248,113,113,0.18);border:1px solid rgba(248,113,113,0.25);' : '';

            return `
            <tr>
                <td>
                    <div style="display:flex;flex-direction:column;gap:4px">
                        <span class="badge">${escapeHtml(idText)}</span>
                        <span style="font-size:11px;color:rgba(148,163,184,0.95)">${escapeHtml(skuText)}</span>
                    </div>
                </td>
                <td style="font-weight: 500;">
                    <div style="display:flex;align-items:center;gap:10px">
                        ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="img" style="width:34px;height:34px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,0.08)"/>` : ''}
                        <span>${escapeHtml(item.name || '')}</span>
                    </div>
                </td>
                <td><span class="stats-badge">${escapeHtml(item.category || 'Other')}</span></td>
                <td><span class="stats-badge">Rs.${price.toLocaleString()}</span></td>
                <td><span class="stats-badge" style="${lowStockStyle}">${stock}</span></td>
                <td><span class="stats-badge">${escapeHtml(storedText)}</span></td>
                <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(item.barcode || '')}">${escapeHtml(item.barcode || '')}</td>
                <td><span class="stats-badge">${stats.timesSold}</span></td>
                <td><span class="stats-badge">Rs.${(stats.revenue || 0).toLocaleString()}</span></td>
                <td><span class="stats-badge">${escapeHtml(stats.lastSoldDate || '-')}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-edit" onclick="startEdit('${escapeHtml(item.sku)}')">✏️ Edit</button>
                        <button class="btn-delete" onclick="handleDelete('${escapeHtml(item.sku)}')">🗑️ Delete</button>
                    </div>
                </td>
            </tr>
        `}).join('');
    } catch (err) {
        console.error('Failed to load items:', err);
        alert('Failed to load items: ' + (err.message || err));
    }
}

async function handleSaveItem() {
    const idInput = document.getElementById('itemId');
    const nameInput = document.getElementById('itemName');
    const barcodeInput = document.getElementById('itemBarcode');

    const categoryInput = document.getElementById('itemCategory');
    const priceInput = document.getElementById('itemPrice');
    const stockInput = document.getElementById('itemStock');
    const storedAtInput = document.getElementById('itemStoredAt');

    const id = parseInt(idInput.value);
    const name = nameInput.value.trim();
    const category = (categoryInput ? categoryInput.value.trim() : '') || 'Other';

    const price = priceInput && priceInput.value !== '' ? parseFloat(priceInput.value) : 0;
    const stockLevel = stockInput && stockInput.value !== '' ? parseInt(stockInput.value, 10) : 0;
    const storedAt = storedAtInput && storedAtInput.value ? storedAtInput.value : null;

    const barcode = barcodeInput ? (barcodeInput.value.trim() || null) : null;
    const imageUrl = currentImageDataUrl || '';

    if (!id || id < 1) {
        alert('Please enter a valid numeric Item Number');
        idInput.focus();
        return;
    }

    if (!name) {
        alert('Item Name is required');
        nameInput.focus();
        return;
    }

    if (Number.isNaN(price) || price < 0) {
        alert('Please enter a valid non-negative Price');
        priceInput?.focus();
        return;
    }

    if (Number.isNaN(stockLevel) || stockLevel < 0) {
        alert('Please enter a valid non-negative Stock Level');
        stockInput?.focus();
        return;
    }

    const newSku = inventorySkuFromId(id);

    try {
        // If adding new item (or changing ID), check if the target SKU exists
        if (!isEditing || newSku !== editingSku) {
            const existing = await getInventoryItem(newSku).catch(() => null);
            if (existing) {
                alert(`Item #${id} already exists (${existing.name}). Please use a different number.`);
                return;
            }
        }

        // If editing and SKU changed, delete old record then create new
        if (isEditing && editingSku && newSku !== editingSku) {
            await deleteInventoryItemBySku(editingSku);
            await saveInventoryItem(id, name, price, stockLevel, category, storedAt, barcode, imageUrl);
        } else if (isEditing && editingSku) {
            await updateInventoryItem(editingSku, { name, barcode, imageUrl, category, price, stockLevel, storedAt });
        } else {
            await saveInventoryItem(id, name, price, stockLevel, category, storedAt, barcode, imageUrl);
        }

        cancelEdit();
        await loadItems();
    } catch (err) {
        console.error('Failed to save item:', err);
        alert('Failed to save item: ' + (err.message || err));
    }
}

// ===== CSV Import Handlers =====
document.addEventListener('DOMContentLoaded', () => {
    const importFile = document.getElementById('importFile');
    const previewBtn = document.getElementById('previewImportBtn');
    if (previewBtn && importFile) {
        previewBtn.addEventListener('click', async () => {
            if (!importFile.files || importFile.files.length === 0) { alert('Please select a CSV file'); return; }
            const file = importFile.files[0];
            const txt = await file.text();
            // Preview first 10 rows by posting to backend parser or using client-side parse
            const preview = await parseCSVClient(txt);
            renderImportPreview(preview);
        });
    }
});

function parseCSVClient(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return { headers: [], rows: [] };
    const parseLine = (line) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
                else inQuotes = !inQuotes;
                continue;
            }
            if (ch === ',' && !inQuotes) { result.push(cur); cur = ''; continue; }
            cur += ch;
        }
        result.push(cur);
        return result.map(s => s.trim());
    };
    const headers = parseLine(lines[0]).map(h => h.toLowerCase());
    const rows = lines.slice(1).map(l => {
        const vals = parseLine(l);
        const obj = {};
        for (let i = 0; i < headers.length; i++) obj[headers[i]] = vals[i] !== undefined ? vals[i] : '';
        return obj;
    });
    return { headers, rows: rows.slice(0,10) };
}

function renderImportPreview(preview) {
    const cont = document.getElementById('importPreview');
    if (!cont) return;
    if (!preview || !preview.rows || preview.rows.length === 0) { cont.innerHTML = '<div>No rows to preview</div>'; return; }
    const rowsHtml = preview.rows.map(r => `<div style="padding:6px;border-bottom:1px solid #111">${escapeHtml(JSON.stringify(r))}</div>`).join('');
    cont.innerHTML = `<div style="max-height:240px;overflow:auto;border:1px solid rgba(255,255,255,0.04);padding:8px">${rowsHtml}</div>
        <div style="margin-top:8px"><button id="confirmImportBtn" class="btn-primary">Import</button></div>`;
    document.getElementById('confirmImportBtn').addEventListener('click', confirmImport);
}

async function confirmImport() {
    const importFile = document.getElementById('importFile');
    if (!importFile.files || importFile.files.length === 0) { alert('Please select a CSV file'); return; }
    const file = importFile.files[0];
    const txt = await file.text();
    try {
        const resp = await fetchAPI('/items/import', { method: 'POST', body: { csv: txt } });
        alert(`Import complete. Updated: ${resp.updated || 0}. Errors: ${resp.errors ? resp.errors.length : 0}`);
        await loadItems();
        document.getElementById('importPreview').innerHTML = '';
    } catch (err) {
        console.error('Import failed', err);
        alert('Import failed: ' + (err.message || err));
    }
}

window.startEdit = async function (sku) {
    try {
        const item = await getInventoryItem(sku);
        if (!item) return;

        const numericId = parseNumericIdFromSku(item.sku);
        document.getElementById('itemId').value = numericId !== null ? numericId : '';
        document.getElementById('itemName').value = item.name || '';
        if (document.getElementById('itemBarcode')) document.getElementById('itemBarcode').value = item.barcode || '';

        if (document.getElementById('itemCategory')) document.getElementById('itemCategory').value = item.category || '';
        if (document.getElementById('itemPrice')) document.getElementById('itemPrice').value = (item.price ?? 0);
        if (document.getElementById('itemStock')) document.getElementById('itemStock').value = (item.stockLevel ?? 0);
        if (document.getElementById('itemStoredAt')) {
            const d = item.storedAt ? new Date(item.storedAt) : null;
            document.getElementById('itemStoredAt').value = (d && !Number.isNaN(d.getTime())) ? d.toISOString().slice(0, 10) : '';
        }

        currentImageDataUrl = item.imageUrl || '';
        const imgInput = document.getElementById('itemImage');
        if (imgInput) imgInput.value = '';
        const imgPrev = document.getElementById('itemImagePreview');
        if (imgPrev) {
            if (currentImageDataUrl) {
                imgPrev.src = currentImageDataUrl;
                imgPrev.classList.remove('hidden');
            } else {
                imgPrev.src = '';
                imgPrev.classList.add('hidden');
            }
        }

        document.getElementById('formTitle').textContent = 'Edit Item';
        document.getElementById('saveItemBtn').textContent = 'Update Item';
        document.getElementById('cancelEditBtn').style.display = 'inline-block';

        isEditing = true;
        editingSku = item.sku;

        document.getElementById('itemName').focus();
    } catch (err) {
        console.error(err);
    }
};

function cancelEdit() {
    isEditing = false;
    editingSku = null;

    document.getElementById('itemId').value = '';
    document.getElementById('itemName').value = '';
    if (document.getElementById('itemBarcode')) document.getElementById('itemBarcode').value = '';
    if (document.getElementById('itemCategory')) document.getElementById('itemCategory').value = '';
    if (document.getElementById('itemPrice')) document.getElementById('itemPrice').value = '';
    if (document.getElementById('itemStock')) document.getElementById('itemStock').value = '';
    if (document.getElementById('itemStoredAt')) document.getElementById('itemStoredAt').value = '';

    currentImageDataUrl = '';
    const imgInput = document.getElementById('itemImage');
    if (imgInput) imgInput.value = '';
    const imgPrev = document.getElementById('itemImagePreview');
    if (imgPrev) {
        imgPrev.src = '';
        imgPrev.classList.add('hidden');
    }

    document.getElementById('formTitle').textContent = 'Add New Item';
    document.getElementById('saveItemBtn').textContent = 'Save Item';
    document.getElementById('cancelEditBtn').style.display = 'none';

    const preview = document.getElementById('barcodePreview');
    if (preview) { preview.classList.add('hidden'); preview.innerHTML = ''; }
}

window.handleDelete = async function (sku) {
    const item = await getInventoryItem(sku).catch(() => null);
    if (!item) {
        alert('Error: Item not found in database (SKU: ' + sku + ')');
        return;
    }

    const numericId = parseNumericIdFromSku(item.sku);
    const label = numericId !== null ? `#${numericId}` : item.sku;

    if (!confirm(`Are you sure you want to delete Item ${label} (${item.name})?`)) {
        return;
    }

    try {
        await deleteInventoryItemBySku(item.sku);
        await loadItems();
    } catch (err) {
        console.error('Failed to delete:', err);
        alert('Failed to delete item: ' + (err.message || err));
    }
};

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

async function handleImageSelected(e) {
    const file = e?.target?.files?.[0];
    const imgPrev = document.getElementById('itemImagePreview');

    if (!file) {
        currentImageDataUrl = '';
        if (imgPrev) {
            imgPrev.src = '';
            imgPrev.classList.add('hidden');
        }
        return;
    }

    // Keep it reasonably small (Base64 grows ~33%)
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
        alert('Image is too large. Please select an image under 2MB.');
        e.target.value = '';
        return;
    }

    try {
        currentImageDataUrl = await readFileAsDataURL(file);
        if (imgPrev) {
            imgPrev.src = currentImageDataUrl;
            imgPrev.classList.remove('hidden');
        }
    } catch (err) {
        console.error(err);
        alert('Failed to load image');
    }
}

async function handleGenerateBarcode() {
    const barcodeInput = document.getElementById('itemBarcode');
    if (!barcodeInput) return;

    const idInput = document.getElementById('itemId');
    const categoryInput = document.getElementById('itemCategory');
    const priceInput = document.getElementById('itemPrice');
    const storedAtInput = document.getElementById('itemStoredAt');

    const id = parseInt(idInput?.value);
    const sku = (isEditing && editingSku) ? editingSku : (id && id > 0 ? inventorySkuFromId(id) : null);

    if (!sku) {
        alert('Please enter a valid Item Number first');
        idInput?.focus();
        return;
    }

    const category = (categoryInput ? categoryInput.value.trim() : '') || 'Other';
    const price = priceInput && priceInput.value !== '' ? parseFloat(priceInput.value) : 0;
    const storedAt = storedAtInput && storedAtInput.value ? storedAtInput.value : new Date().toISOString().slice(0, 10);

    try {
        const resp = await generateStructuredBarcode({ sku, category, price, storedAt });
        barcodeInput.value = resp.code || '';
    } catch (err) {
        console.error(err);
        alert('Failed to generate barcode: ' + (err.message || err));
    }
}

async function handlePrintBarcode() {
    const barcodeInput = document.getElementById('itemBarcode');
    const nameInput = document.getElementById('itemName');

    try {
        let item = null;
        if (isEditing && editingSku) {
            item = await getInventoryItem(editingSku).catch(() => null);
        }

        const name = (item && item.name) ? item.name : (nameInput ? nameInput.value.trim() : '');
        const sku = (item && item.sku) ? item.sku : (isEditing && editingSku ? editingSku : '');
        const code = (item && item.barcode) ? item.barcode : (barcodeInput ? barcodeInput.value.trim() : '');

        const textToEncode = code || sku;
        if (!textToEncode) {
            alert('No barcode (or SKU) to print. Generate or enter a barcode first.');
            return;
        }

        const symbology = (isDigits(textToEncode) && String(textToEncode).length === 13) ? 'ean13' : 'code128';
        const img = await renderBarcodePng(textToEncode, symbology, 3, 12, true);

        const labelHtml = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Barcode Label</title>
  <style>
    @page { margin: 0; }
    body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .label { width: 60mm; padding: 6mm 4mm; box-sizing: border-box; }
    .name { font-size: 12px; font-weight: 700; margin-bottom: 2mm; }
    .sku { font-size: 10px; margin-bottom: 2mm; }
    img { width: 100%; height: auto; display: block; }
  </style>
</head>
<body>
  <div class="label">
    ${name ? `<div class="name">${escapeHtml(name)}</div>` : ''}
    ${sku ? `<div class="sku">${escapeHtml(sku)}</div>` : ''}
    <img src="data:${img.mime};base64,${img.data}" alt="barcode"/>
  </div>
</body>
</html>`;

        const preview = document.getElementById('barcodePreview');
        if (preview) {
            preview.classList.remove('hidden');
            preview.innerHTML = `<img style="max-width:100%;border:1px solid rgba(255,255,255,0.08);border-radius:8px" src="data:${img.mime};base64,${img.data}" alt="barcode preview"/>`;
        }

        if (window.electronAPI && window.electronAPI.printReceipt) {
            window.electronAPI.printReceipt(labelHtml);
        } else {
            const w = window.open('', '_blank', 'width=420,height=640');
            w.document.write(labelHtml);
            w.document.close();
            w.focus();
            w.print();
        }
    } catch (err) {
        console.error(err);
        alert('Failed to print barcode: ' + (err.message || err));
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* placeholder aria-label */
