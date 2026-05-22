// Live Clock
function updateClock() {
    const now = new Date();

    // Time
    const timeStr = now.toLocaleTimeString('en-LK', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('liveTime').textContent = timeStr;

    // Date
    const dateStr = now.toLocaleDateString('en-LK', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('liveDate').textContent = dateStr;
}

// Initial update and interval
updateClock();
setInterval(updateClock, 1000);

// Initialize Inputs with Current Values
const now = new Date();
const dateInput = document.getElementById('dateInput');
const timeInput = document.getElementById('timeInput');

// Format date for input: YYYY-MM-DD
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
dateInput.value = `${year}-${month}-${day}`;

// Format time for input: HH:mm:ss
const hours = String(now.getHours()).padStart(2, '0');
const minutes = String(now.getMinutes()).padStart(2, '0');
const seconds = String(now.getSeconds()).padStart(2, '0');
timeInput.value = `${hours}:${minutes}:${seconds}`;

// Handle Update Button
document.getElementById('updateTimeBtn').addEventListener('click', async () => {
    const dateVal = dateInput.value;
    const timeVal = timeInput.value;

    if (!dateVal || !timeVal) {
        alert('Please select both date and time');
        return;
    }

    // Format for PowerShell: MM-dd-yyyy HH:mm:ss
    const [y, m, d] = dateVal.split('-');
    const formattedDate = `${m}-${d}-${y} ${timeVal}`;

    try {
        if (window.electronAPI && window.electronAPI.setSystemTime) {
            await window.electronAPI.setSystemTime(formattedDate);
            alert('Request sent! Please approve the administrator prompt to update time.');
        } else {
            console.error('Electron API not available');
            alert('System time update is only available in the desktop app.');
        }
    } catch (err) {
        console.error('Error updating time:', err);
        alert('Failed to initiate time update: ' + err);
    }
});

// ===== Item Popup Toggle =====
const itemPopupToggle = document.getElementById('itemPopupToggle');

// Load saved preference
const useItemPopup = localStorage.getItem('useItemNumberPopup') === 'true';
itemPopupToggle.checked = useItemPopup;

// Save when toggled
itemPopupToggle.addEventListener('change', () => {
    localStorage.setItem('useItemNumberPopup', itemPopupToggle.checked);

    // Visual feedback
    const statusText = itemPopupToggle.checked ? 'enabled' : 'disabled';
    const tempMsg = document.createElement('div');
    tempMsg.textContent = `Item Number Popup ${statusText}`;
    tempMsg.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--primary);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(tempMsg);
    setTimeout(() => {
        tempMsg.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => tempMsg.remove(), 300);
    }, 2000);
});

// ===== Keyboard Shortcuts Toggle =====
const keyboardShortcutsToggle = document.getElementById('keyboardShortcutsToggle');

if (keyboardShortcutsToggle) {
    // Load saved preference (Default to true)
    const enableShortcuts = localStorage.getItem('enableKeyboardShortcuts') !== 'false';
    keyboardShortcutsToggle.checked = enableShortcuts;

    // Save when toggled
    keyboardShortcutsToggle.addEventListener('change', () => {
        localStorage.setItem('enableKeyboardShortcuts', keyboardShortcutsToggle.checked);

        // Visual feedback
        const statusText = keyboardShortcutsToggle.checked ? 'enabled' : 'disabled';
        const tempMsg = document.createElement('div');
        tempMsg.textContent = `Keyboard Shortcuts ${statusText}`;
        tempMsg.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 9999;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        `;
        document.body.appendChild(tempMsg);
        setTimeout(() => {
            tempMsg.style.opacity = '0';
            tempMsg.style.transition = 'opacity 0.3s ease';
            setTimeout(() => tempMsg.remove(), 300);
        }, 2000);
    });
}

// ===== API Server Settings =====
(function initApiOriginSettings() {
    const input = document.getElementById('apiOriginInput');
    const btnSave = document.getElementById('btnSaveApiOrigin');
    const btnTest = document.getElementById('btnTestApiOrigin');
    const status = document.getElementById('apiOriginStatus');

    if (!input || !btnSave || !btnTest || !status) return;
    if (!window.POS_API || typeof window.POS_API.getApiOrigin !== 'function') return;

    input.value = window.POS_API.getApiOrigin();

    function showStatus(message, variant = 'info') {
        status.classList.remove('hidden');
        if (variant === 'ok') {
            status.className = 'text-sm font-semibold rounded-lg p-4 bg-emerald-900/50 text-emerald-400 border border-emerald-500/20 block text-center';
        } else if (variant === 'error') {
            status.className = 'text-sm font-semibold rounded-lg p-4 bg-red-900/50 text-red-400 border border-red-500/20 block text-center';
        } else {
            status.className = 'text-sm font-semibold rounded-lg p-4 bg-slate-800 text-blue-400 block text-center';
        }
        status.textContent = message;
    }

    btnSave.addEventListener('click', () => {
        try {
            const normalized = window.POS_API.setApiOrigin(input.value);
            input.value = normalized;
            showStatus(`Saved API origin: ${normalized}`, 'ok');
        } catch (err) {
            showStatus(err && err.message ? err.message : String(err), 'error');
        }
    });

    btnTest.addEventListener('click', async () => {
        try {
            showStatus('Testing connection...', 'info');
            const t0 = performance && performance.now ? performance.now() : Date.now();
            const response = await fetch(`${window.POS_API.getApiBase()}/health`);
            const t1 = performance && performance.now ? performance.now() : Date.now();
            const ms = Math.round(t1 - t0);
            const health = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(health.message || `Health check failed (${response.status})`);
            }
            const dbStatus = health.database && health.database.status ? health.database.status : 'unknown';
            showStatus(`Connected in ${ms}ms. /health: OK, database: ${dbStatus}`, 'ok');
        } catch (err) {
            showStatus(`Connection failed: ${err && err.message ? err.message : String(err)}`, 'error');
        }
    });
})();

// ===== Developer Mode & Feature Flags =====
const devModeToggle = document.getElementById('devModeToggle');
const featureFlags = [
    { id: 'flagAISales', key: 'feature_ai_sales', label: 'AI Sales Predictions' },
    { id: 'flagCloudSync', key: 'feature_cloud_sync', label: 'Cloud Sync' },
    { id: 'flagRestock', key: 'feature_restock', label: 'AI Restock Intelligence' },
    { id: 'flagEmpAI', key: 'feature_emp_ai', label: 'Employee AI Performance' },
    { id: 'flagEmbeddedPrice', key: 'feature_embedded_price', label: 'Embedded-price Parsing' }
];

// Dev Mode
if (devModeToggle) {
    devModeToggle.checked = localStorage.getItem('devMode') === 'true';
    devModeToggle.addEventListener('change', () => {
        localStorage.setItem('devMode', devModeToggle.checked);
        showToast(`Developer Mode ${devModeToggle.checked ? 'ENABLED' : 'DISABLED'}`, '#eab308');
    });
}

// Feature Flags
featureFlags.forEach(flag => {
    const el = document.getElementById(flag.id);
    if (el) {
        const saved = localStorage.getItem(flag.key);
        el.checked = saved === null ? true : saved === 'true'; // Default to enabled
        el.addEventListener('change', () => {
            localStorage.setItem(flag.key, el.checked);
            showToast(`${flag.label}: ${el.checked ? 'ON' : 'OFF'}`, el.checked ? '#10b981' : '#64748b');
        });
    }
});

// Reusable toast notification
function showToast(message, color) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: ${color}; color: white;
        padding: 12px 24px; border-radius: 8px;
        font-weight: 600; font-size: 0.875rem;
        z-index: 9999;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ===== Barcode Mapping Review UI (Admin) =====
(function initMappingUI() {
    try {
        // Create review button and append to header area
        const header = document.querySelector('header');
        if (!header) return;
        const btn = document.createElement('button');
        btn.id = 'reviewMappingsBtn';
        btn.className = 'bg-amber-500 hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-bold';
        btn.style.marginLeft = '12px';
        btn.textContent = 'Review Barcode Mappings';
        btn.addEventListener('click', openMappingModal);
        header.appendChild(btn);

        // Create modal container
        const modal = document.createElement('div');
        modal.id = 'mappingModal';
        modal.style.cssText = `position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 2000;`;
        modal.innerHTML = `
            <div style="background: rgba(0,0,0,0.6); position: absolute; inset:0;"></div>
            <div style="background: var(--background-dark); color: white; padding: 18px; border-radius: 8px; width: 880px; max-width: 95%; z-index: 2001;">
                <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="margin:0;">Barcode Mapping Suggestions</h3>
                    <button id="closeMappingModal" style="background:#374151;color:white;padding:6px 10px;border-radius:6px;">Close</button>
                </div>
                <div id="mappingList" style="max-height: 60vh; overflow:auto;"></div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('closeMappingModal').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    } catch (err) {
        console.error('Mapping UI init failed', err);
    }
})();

async function openMappingModal() {
    const modal = document.getElementById('mappingModal');
    if (!modal) return;
    modal.style.display = 'flex';
    await loadMappingSuggestions();
}

async function loadMappingSuggestions() {
    const container = document.getElementById('mappingList');
    if (!container) return;
    container.innerHTML = '<div style="padding: 12px;">Loading...</div>';
    try {
        const suggestions = await fetchAPI('/mappings/suggestions');
        if (!suggestions || suggestions.length === 0) {
            container.innerHTML = '<div style="padding: 12px;">No suggestions to review.</div>';
            return;
        }
        container.innerHTML = suggestions.map(s => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700">Scanned: <code style="background:#111827;padding:2px 6px;border-radius:4px;">${escapeHtml(s.scannedBarcode)}</code></div>
                    <div style="font-size:0.9rem;color:#9ca3af">Price: ${s.priceUsed || '-'} • Qty: ${s.quantity || 1} • Source: ${s.source || '-'}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                    <input id="mapInput_${s.id}" placeholder="Enter SKU to map" style="padding:8px;border-radius:6px;background:#0b1220;border:1px solid rgba(255,255,255,0.04);color:white;" />
                    <button onclick="mapBarcode('${s.scannedBarcode}', document.getElementById('mapInput_${s.id}').value)" style="background:#10b981;color:white;padding:8px 10px;border-radius:6px;">Map</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load suggestions', err);
        container.innerHTML = '<div style="padding: 12px;color:#fca5a5">Failed to load suggestions</div>';
    }
}

async function mapBarcode(scannedBarcode, sku) {
    if (!scannedBarcode || !sku) {
        showToast('Please enter a SKU to map to', '#ef4444');
        return;
    }
    try {
        const resp = await fetchAPI('/mappings/map', { method: 'POST', body: { scannedBarcode, sku } });
        showToast(`Mapped to ${sku} (affected: ${resp.affected || 0})`, '#10b981');
        await loadMappingSuggestions();
    } catch (err) {
        console.error('Map failed', err);
        showToast('Mapping failed: ' + (err.message || 'unknown'), '#ef4444');
    }
}
