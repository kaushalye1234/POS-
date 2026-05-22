// ===== Configuration =====
// Reads from localStorage (settable in Settings page). Defaults to false for production.
const TESTING_MODE = localStorage.getItem('pos_testing_mode') === 'true';

// ===== State Management =====
let currentPrice = '0';
let currentQuantity = 1;
let items = [];
let itemCounter = 0;
let multiplyMode = false;
let multiplyFirstValue = 0;
let enableKeyboardShortcuts = localStorage.getItem('enableKeyboardShortcuts') !== 'false'; // Default to true

// ===== DOM Elements =====
const priceDisplay = document.getElementById('priceDisplay');
const itemNameInput = document.getElementById('itemName');
const itemCategorySelect = document.getElementById('itemCategory');
const quantityDisplay = document.getElementById('quantity');
const itemsList = document.getElementById('itemsList');
const subtotalDisplay = document.getElementById('subtotal');
const itemCountDisplay = document.getElementById('itemCount');
const grandTotalDisplay = document.getElementById('grandTotal');
const checkoutBtn = document.getElementById('checkout');
const checkoutModal = document.getElementById('checkoutModal');
const modalTotal = document.getElementById('checkoutTotal');
const amountReceivedInput = document.getElementById('amountReceived');
const changeAmountDisplay = document.getElementById('changeAmount');
const changeDisplay = document.getElementById('changeDisplay');
// Item Selection Modal
const itemSelectionModal = document.getElementById('itemSelectionModal');
const itemSelectionInput = document.getElementById('itemSelectionInput');
const itemPreview = document.getElementById('itemPreview');
const confirmItemSelectionBtn = document.getElementById('confirmItemSelection');
const closeItemModalBtn = document.getElementById('closeItemModal');
let pendingItemToAdd = null; // Store item data temporarily while selecting name

// ===== Date/Time Display =====
function updateDateTime() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-LK', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('en-LK', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const dateElement = document.getElementById('currentDate');
    const timeElement = document.getElementById('currentTime');

    if (dateElement) dateElement.textContent = dateStr;
    if (timeElement) timeElement.textContent = timeStr;
}

// Update date/time every second
setInterval(updateDateTime, 1000);
updateDateTime(); // Initial call

// ===== Number Pad Functions =====
function appendNumber(value) {
    // If checkout modal is open, append to amount received
    if (checkoutModal.classList.contains('active')) {
        const input = amountReceivedInput;
        let newVal = input.value;

        if (newVal === '' && value !== '.') {
            newVal = value;
        } else if (value === '.' && newVal.includes('.')) {
            return;
        } else {
            newVal += value;
        }

        input.value = newVal;
        calculateChange();
        return;
    }

    if (currentPrice === '0' && value !== '.') {
        currentPrice = value;
    } else if (value === '.' && currentPrice.includes('.')) {
        return; // Prevent multiple decimals
    } else if (value === '00' && currentPrice === '0') {
        return; // Prevent leading zeros
    } else {
        // Limit decimal places to 2
        if (currentPrice.includes('.')) {
            const decimalPart = currentPrice.split('.')[1];
            if (decimalPart && decimalPart.length >= 2) {
                return;
            }
        }
        currentPrice += value;
    }
    updateDisplay();
}

function backspace() {
    // If checkout modal is open, handle backspace for amount received
    if (checkoutModal.classList.contains('active')) {
        const input = amountReceivedInput;
        if (input.value.length > 0) {
            input.value = input.value.slice(0, -1);
            calculateChange();
        }
        return;
    }

    if (currentPrice.length > 1) {
        currentPrice = currentPrice.slice(0, -1);
    } else {
        currentPrice = '0';
    }
    updateDisplay();
}

function clearEntry() {
    // If checkout modal is open, clear amount received
    if (checkoutModal.classList.contains('active')) {
        amountReceivedInput.value = '';
        calculateChange();
        return;
    }

    // Two-stage clear:
    // 1. If numbers are entered (price or qty), clear only numbers.
    // 2. If numbers are already cleared, clear item details (name/category).
    if (currentPrice !== '0' || currentQuantity !== 1 || multiplyMode) {
        currentPrice = '0';
        currentQuantity = 1;
        multiplyMode = false;
        multiplyFirstValue = 0;
        updateDisplay();
        updateQuantityDisplay();
    } else {
        // Numbers are already clear, so clear the item text
        itemNameInput.value = '';
        if (itemCategorySelect) itemCategorySelect.value = '';
        // Also ensure numbers stay cleared (redundant but safe)
        currentPrice = '0';
        currentQuantity = 1;
        updateDisplay();
        updateQuantityDisplay();
    }
}

function updateDisplay() {
    priceDisplay.value = formatNumber(parseFloat(currentPrice) || 0);
}

function formatNumber(num) {
    return num.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function formatCurrency(amount) {
    return 'Rs.' + amount.toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// ===== Multiplication Function =====
function multiply() {
    // If checkout modal is open, ignore multiplication
    if (checkoutModal.classList.contains('active')) {
        return;
    }

    const currentValue = parseFloat(currentPrice) || 0;

    if (!multiplyMode) {
        // First press: store the value and enter multiply mode
        multiplyFirstValue = currentValue;
        multiplyMode = true;
        currentPrice = '0';
        updateDisplay();
    }
    // Note: multiply mode will be completed when user presses "+" to add item
}

// Function to handle adding item with multiplication check
function addItemWithMultiplyCheck(discountEligible) {
    // If in multiply mode, set price and quantity appropriately
    if (multiplyMode) {
        const multiplier = parseFloat(currentPrice) || 0;
        // Set the unit price as the first value
        currentPrice = multiplyFirstValue.toString();
        // Set the quantity as the multiplier
        currentQuantity = Math.round(multiplier);
        updateDisplay();
        updateQuantityDisplay();
        multiplyMode = false;
        multiplyFirstValue = 0;
        // Add item with the correct price and quantity
        setTimeout(() => addItem(discountEligible), 50);
    } else {
        addItem(discountEligible);
    }
}

// ===== Quantity Functions =====
function incrementQuantity() {
    currentQuantity++;
    updateQuantityDisplay();
}

function decrementQuantity() {
    if (currentQuantity > 1) {
        currentQuantity--;
        updateQuantityDisplay();
    }
}

function updateQuantityDisplay() {
    quantityDisplay.textContent = currentQuantity;
}

// ===== Item Management =====
async function addItem(discountEligible = false) {
    const price = parseFloat(currentPrice);
    if (price <= 0) {
        shakeElement(priceDisplay.parentElement);
        return;
    }

    // Capture pending item details
    pendingItemToAdd = {
        price: price,
        quantity: currentQuantity,
        discountEligible: discountEligible,
        category: itemCategorySelect ? itemCategorySelect.value : ''
    };

    // If Name is already typed, add directly
    if (itemNameInput.value.trim() !== '') {
        pendingItemToAdd.name = itemNameInput.value.trim();
        finalizeAddItem(pendingItemToAdd);
        return;
    }

    // Check if item number popup is enabled
    const useItemPopup = localStorage.getItem('useItemNumberPopup') === 'true';

    if (useItemPopup) {
        // Show popup to enter item number
        openItemSelectionModal();
    } else {
        // Auto-generate sequential name (default behavior)
        itemCounter++;
        pendingItemToAdd.name = `Item ${itemCounter}`;
        finalizeAddItem(pendingItemToAdd);
    }
}

function openItemSelectionModal() {
    itemSelectionModal.classList.add('active');
    itemSelectionInput.value = '';
    itemPreview.textContent = 'Enter a number to see item name';
    itemPreview.style.color = 'var(--text-secondary)';

    // Focus input after small delay for animation
    setTimeout(() => {
        itemSelectionInput.focus();
    }, 100);
}

function closeItemSelectionModal() {
    itemSelectionModal.classList.remove('active');
    pendingItemToAdd = null;
    // Return focus to price display
    priceDisplay.focus();
}

// Show a confirmation modal when a price is derived from a barcode and requires cashier confirmation.
// Returns a Promise<boolean> that resolves to true when cashier confirms, false otherwise.
function showPriceConfirmation(itemData) {
    return new Promise(resolve => {
        // Remove existing modal if any
        const existing = document.getElementById('priceConfirmModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'priceConfirmModal';
        modal.className = 'modal-overlay active';
        modal.style.position = 'fixed';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(0,0,0,0.6)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '9999';

        const box = document.createElement('div');
        box.style.background = '#0b1220';
        box.style.color = '#fff';
        box.style.padding = '20px';
        box.style.borderRadius = '8px';
        box.style.width = '420px';
        box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        box.innerHTML = `
            <h3 style="margin:0 0 8px 0; font-size:18px">Confirm price from barcode</h3>
            <div style="margin-bottom:12px; font-size:14px; color: #cbd5e1">${escapeHtml(itemData.name || 'Unknown Item')}</div>
            <div style="margin-bottom:6px">SKU: <strong>${escapeHtml(itemData.sku || '')}</strong></div>
            <div style="margin-bottom:12px">Price detected: <strong style="font-size:16px">${formatCurrency(itemData.price)}</strong></div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px">
                <button id="priceConfirmCancel" style="background:#374151;color:#fff;border:none;padding:8px 12px;border-radius:6px;">Cancel</button>
                <button id="priceConfirmOk" style="background:#10b981;color:#fff;border:none;padding:8px 12px;border-radius:6px;">Confirm</button>
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

        const cleanup = (result) => {
            try { modal.remove(); } catch(e){}
            resolve(result);
        };

        document.getElementById('priceConfirmOk').addEventListener('click', () => cleanup(true));
        document.getElementById('priceConfirmCancel').addEventListener('click', () => cleanup(false));

        // Close on Escape
        const onKey = (e) => { if (e.key === 'Escape') { cleanup(false); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);

        // Focus confirm button
        setTimeout(() => document.getElementById('priceConfirmOk').focus(), 50);
    });
}

// Handle confirming selection from modal
async function confirmItemSelection() {
    if (!pendingItemToAdd) return;

    const itemIdRaw = itemSelectionInput.value.trim();

    // If empty input, use Default Name "Item X"
    if (!itemIdRaw) {
        itemCounter++;
        pendingItemToAdd.name = `Item ${itemCounter}`;
    } else {
        // Look up item in database
        try {
            const item = await getInventoryItem(inventorySkuFromId(parseInt(itemIdRaw)));
            if (item) {
                pendingItemToAdd.name = item.name;
            } else {
                // If ID not found, use "Item X" (or could optionally assume it's just a default item)
                itemCounter++;
                pendingItemToAdd.name = `Item ${itemCounter}`;
            }
        } catch (err) {
            console.error('Error looking up item:', err);
            itemCounter++;
            pendingItemToAdd.name = `Item ${itemCounter}`;
        }
    }

    finalizeAddItem(pendingItemToAdd);
    closeItemSelectionModal();
}

function finalizeAddItem(itemData) {
    // itemCounter is already incremented in addItem() or confirmItemSelection()
    // No need to increment again here

    const lineTotal = itemData.price * itemData.quantity;

    const item = {
        id: Date.now(),
        name: itemData.name,
        category: itemData.category,
        price: itemData.price,
        quantity: itemData.quantity,
        total: lineTotal,
        discountEligible: itemData.discountEligible
    };

    items.push(item);
    renderItems();
    updateTotals();
    clearEntry();

    // Visual feedback
    pulseElement(checkoutBtn);

    // Reset pending
    pendingItemToAdd = null;
}

// Quick add functions for shortcuts
function quickAddWithDiscount() {
    // F3: Add item with discount eligibility
    if (parseFloat(currentPrice) > 0) {
        addItem(true);
        // Reset focus to body so next number keypress goes to price
        document.activeElement.blur();
        currentPrice = '0';
        updateDisplay();
    }
}

function quickAddWithoutDiscount() {
    // F4: Add item without discount eligibility
    if (parseFloat(currentPrice) > 0) {
        addItem(false);
        // Reset focus to body so next number keypress goes to price
        document.activeElement.blur();
        currentPrice = '0';
        updateDisplay();
    }
}

function removeItem(id) {
    items = items.filter(item => item.id !== id);
    renderItems();
    updateTotals();
}

function clearAllItems() {
    if (items.length === 0) return;

    if (confirm('Are you sure you want to clear all items?')) {
        items = [];
        itemCounter = 0;
        renderItems();
        updateTotals();
        clearEntry();
    }
}

function renderItems() {
    if (items.length === 0) {
        itemsList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📝</span>
                <p>No items added yet</p>
                <p class="hint">Enter a price and tap + to add</p>
            </div>
        `;
        return;
    }

    itemsList.innerHTML = items.map(item => `
        <div class="item-row" data-id="${item.id}">
            <div class="item-info">
                <div class="item-name">
                    ${escapeHtml(item.name)}
                    ${item.discountEligible ? '<span style="color: var(--secondary); font-size: 0.7rem; margin-left: 4px;">Discount</span>' : ''}
                </div>
                <div class="item-details">
                    ${item.category ? `${item.category} • ` : ''}${formatCurrency(item.price)} × ${item.quantity}
                </div>
            </div>
            <div class="item-price">${formatCurrency(item.total)}</div>
            <button class="item-delete" onclick="removeItem(${item.id})" title="Remove item">×</button>
        </div>
    `).join('');

    // Scroll to bottom
    itemsList.scrollTop = itemsList.scrollHeight;
}

// SEC-008 FIX: Pure string-based escapeHtml — no DOM dependency, consistent behavior
function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function updateTotals() {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    // BUG-003 FIX: Recalculate discount when items change (if a discount rule is active)
    const rule = getSelectedDiscountRule();
    if (rule) {
        discountAmount = computeDiscountAmount(rule, subtotal);
    }

    const displayTotal = subtotal - discountAmount;
    subtotalDisplay.textContent = formatCurrency(subtotal);
    itemCountDisplay.textContent = totalItems;
    grandTotalDisplay.textContent = formatCurrency(displayTotal);

    checkoutBtn.disabled = items.length === 0;

    // If checkout modal is open, refresh its totals too
    if (checkoutModal.classList.contains('active')) {
        calculateChange();
    }
}

// ===== Quick Amount Functions =====
function setQuickAmount(amount) {
    currentPrice = amount.toString();
    updateDisplay();
}

// ===== Checkout Functions =====
async function openCheckout() {
    console.log('Opening checkout modal...'); // Debug
    if (items.length === 0) {
        console.log('No items to checkout');
        return;
    }

    amountReceivedInput.value = '';
    changeAmountDisplay.textContent = formatCurrency(0);
    changeDisplay.classList.remove('negative');

    // Load discount rules for this checkout (non-blocking UX)
    await loadDiscountRulesForCheckout();

    // Ensure totals are calculated with current selection
    calculateChange();

    checkoutModal.classList.add('active');
    console.log('Checkout modal class added. Modal:', checkoutModal);
    setTimeout(() => amountReceivedInput.focus(), 300);
}

function closeCheckout() {
    checkoutModal.classList.remove('active');
}

// Discount Logic
let discountAmount = 0;
let discountRulesCache = [];
let selectedDiscountRuleId = '';
let selectedDiscountValue = null; // for range rules

function parseDateOnly(dateStr) {
    if (!dateStr) return null;
    // expected yyyy-mm-dd from <input type="date">
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isRuleActiveNow(rule) {
    if (!rule || !rule.active) return false;
    const start = parseDateOnly(rule.startDate);
    const end = parseDateOnly(rule.endDate);
    const today = new Date();
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (start && t < start) return false;
    if (end && t > end) return false;
    return true;
}

function getSelectedDiscountRule() {
    return discountRulesCache.find(r => String(r.id) === String(selectedDiscountRuleId)) || null;
}

function getRuleLabel(rule) {
    if (!rule) return '';
    const name = rule.name || rule.id;
    if (rule.type === 'bogo') return `${name} (BOGO)`;

    const isRange = rule.valueType === 'range';
    if (rule.type === 'percentage') {
        return isRange ? `${name} (${rule.valueMin}% - ${rule.valueMax}%)` : `${name} (${rule.value}%)`;
    }
    if (rule.type === 'fixed') {
        return isRange ? `${name} (Rs. ${rule.valueMin} - ${rule.valueMax})` : `${name} (Rs. ${rule.value})`;
    }
    return name;
}

async function loadDiscountRulesForCheckout() {
    const select = document.getElementById('discountRuleSelect');
    if (!select) return;

    // preserve selection if possible
    const prev = select.value;

    try {
        const rules = await getAllDiscountRules();
        discountRulesCache = Array.isArray(rules) ? rules.filter(isRuleActiveNow) : [];
    } catch (err) {
        console.warn('Failed to load discount rules:', err);
        discountRulesCache = [];
    }

    select.innerHTML = `<option value="" class="bg-slate-800 text-slate-300">No Discount</option>` +
        discountRulesCache.map(r => `<option value="${escapeHtml(String(r.id))}" class="bg-slate-800 text-slate-300">${escapeHtml(getRuleLabel(r))}</option>`).join('');

    select.value = prev;
    onDiscountRuleSelectChanged();
}

function updateDiscountRangeUI(rule) {
    const wrap = document.getElementById('discountRangeWrap');
    const input = document.getElementById('discountValueInput');
    const hint = document.getElementById('discountRangeHint');

    if (!wrap || !input || !hint) return;

    if (!rule || rule.type === 'bogo' || rule.valueType !== 'range') {
        wrap.classList.add('hidden');
        selectedDiscountValue = null;
        return;
    }

    const min = Number(rule.valueMin || 0);
    const max = Number(rule.valueMax || 0);
    input.min = String(min);
    input.max = String(max);
    input.step = '0.01';

    if (selectedDiscountValue === null || isNaN(selectedDiscountValue)) {
        selectedDiscountValue = min;
    }

    // clamp
    selectedDiscountValue = Math.max(min, Math.min(max, Number(selectedDiscountValue)));
    input.value = String(selectedDiscountValue);

    hint.textContent = rule.type === 'percentage' ? `${min}% - ${max}%` : `Rs. ${min} - ${max}`;
    wrap.classList.remove('hidden');
}

function onDiscountRuleSelectChanged() {
    const select = document.getElementById('discountRuleSelect');
    selectedDiscountRuleId = select ? (select.value || '') : '';
    selectedDiscountValue = null;

    const rule = getSelectedDiscountRule();
    updateDiscountRangeUI(rule);
    calculateChange();
}

function onDiscountRangeValueChanged() {
    const input = document.getElementById('discountValueInput');
    const v = input ? parseFloat(input.value) : NaN;
    selectedDiscountValue = Number.isFinite(v) ? v : null;
    calculateChange();
}

function computeDiscountAmount(rule, rawTotal) {
    if (!rule) return 0;

    // min purchase threshold is based on full cart
    if (rule.minPurchase && rawTotal < Number(rule.minPurchase)) return 0;

    // Apply discount only to eligible items (and optional category)
    const eligibleItems = items.filter(it => {
        if (!it.discountEligible) return false;
        if (rule.appliesTo && rule.appliesTo !== 'all') {
            return String(it.category || '') === String(rule.appliesTo);
        }
        return true;
    });

    const eligibleTotal = eligibleItems.reduce((sum, it) => sum + it.total, 0);
    if (eligibleTotal <= 0) return 0;

    if (rule.type === 'bogo') {
        // Not implemented in checkout calculation yet
        return 0;
    }

    const isRange = rule.valueType === 'range';

    if (rule.type === 'percentage') {
        const pct = isRange ? Number(selectedDiscountValue || 0) : Number(rule.value || 0);
        if (pct <= 0) return 0;
        return eligibleTotal * (pct / 100);
    }

    if (rule.type === 'fixed') {
        const amt = isRange ? Number(selectedDiscountValue || 0) : Number(rule.value || 0);
        if (amt <= 0) return 0;
        return Math.min(amt, eligibleTotal);
    }

    return 0;
}

function calculateChange() {
    const rawTotal = items.reduce((sum, item) => sum + item.total, 0);

    const rule = getSelectedDiscountRule();
    discountAmount = computeDiscountAmount(rule, rawTotal);

    const finalTotal = rawTotal - discountAmount;

    // Update displays
    document.getElementById('checkoutTotal').textContent = formatCurrency(finalTotal);

    const discountDisplay = document.getElementById('discountDisplay');
    if (discountDisplay) {
        if (discountAmount > 0) {
            discountDisplay.textContent = `- ${formatCurrency(discountAmount)}`;
            discountDisplay.classList.remove('hidden');
        } else {
            discountDisplay.classList.add('hidden');
        }
    }

    const received = parseFloat(amountReceivedInput.value) || 0;
    const change = received - finalTotal;

    changeAmountDisplay.textContent = formatCurrency(Math.abs(change));

    if (change < 0) {
        changeDisplay.classList.add('negative');
        changeDisplay.querySelector('span:first-child').textContent = 'Due';
    } else {
        changeDisplay.classList.remove('negative');
        changeDisplay.querySelector('span:first-child').textContent = 'Change';
    }
}

function printReceipt() {
    const employeeIdInput = document.getElementById('employeeId');
    const rawId = parseInt(employeeIdInput.value);

    // Validate employee ID
    if (!rawId || rawId < 1) {
        alert('Please enter a valid Employee ID (1, 2, 3...)');
        employeeIdInput.focus();
        return;
    }

    const employeeId = 'E' + rawId;
    const rawTotal = items.reduce((sum, item) => sum + item.total, 0);
    const finalTotal = rawTotal - discountAmount;
    const received = parseFloat(amountReceivedInput.value) || finalTotal;
    const change = received - finalTotal;

    // Get selected customer
    const custSelect = document.getElementById('checkoutCustomer');
    const custId = custSelect && custSelect.value ? parseInt(custSelect.value) : null;
    const custName = custSelect && custSelect.value ? custSelect.options[custSelect.selectedIndex].text.split(' (')[0] : null;

    // Save to database
    if (typeof saveSale === 'function' && db) {
        saveSale(employeeId, finalTotal, received, change, items, discountAmount, custId, custName)
            .then(saleId => {
                console.log('Sale saved with ID:', saleId);
                // Simple loyalty point crediting
                if (custId && typeof updateCustomerLoyaltyPoints === 'function') {
                    const points = Math.floor(finalTotal / 100); // 1 point per Rs.100
                    updateCustomerLoyaltyPoints(custId, points);
                }
            })
            .catch(err => console.error('Failed to save sale:', err));
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-LK');
    const timeStr = now.toLocaleTimeString('en-LK');

    // BUG-002 FIX: Build a dynamic discount label from the active rule instead of hardcoded "5%"
    let receiptDiscountLabel = 'Discount';
    const activeRule = getSelectedDiscountRule();
    if (activeRule) {
        const ruleName = activeRule.name || 'Discount';
        if (activeRule.type === 'percentage') {
            const pct = activeRule.valueType === 'range' ? selectedDiscountValue : activeRule.value;
            receiptDiscountLabel = `${ruleName} (${pct}%)`;
        } else if (activeRule.type === 'fixed') {
            const amt = activeRule.valueType === 'range' ? selectedDiscountValue : activeRule.value;
            receiptDiscountLabel = `${ruleName} (Rs.${amt})`;
        } else {
            receiptDiscountLabel = ruleName;
        }
    }

    // SEC-001 FIX: All dynamic values escaped to prevent XSS in print window
    const itemsHtml = items.map(item => `
        <tr>
            <td class="item-name">
                ${item.category ? `<small>[${escapeHtml(item.category)}]</small> ` : ''}${escapeHtml(item.name)}
                ${item.discountEligible ? '*' : ''}
            </td>
            <td class="price">${formatCurrency(item.price)}</td>
            <td class="qty">${escapeHtml(String(item.quantity))}</td>
            <td class="amount">${formatCurrency(item.total)}</td>
        </tr>
    `).join('');

    const receiptHtml = `
        <html>
        <head>
            <title>Receipt</title>
            <style>
                @page { margin: 0; }
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    font-size: 14px;
                    padding: 0;
                    margin: 0;
                    width: 72mm;
                    color: black;
                    line-height: 1.4;
                }
                .container {
                    padding: 10px;
                    text-align: center;
                }
                .brand-logo {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 900;
                    text-transform: uppercase;
                    margin: 10px 0;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .brand-fashion {
                    background: #dc2626;
                    color: white;
                    padding: 6px 10px;
                    font-size: 24px;
                }
                .brand-shaa {
                    background: black;
                    color: white;
                    padding: 6px 12px;
                    font-size: 24px;
                }
                .shop-info {
                    font-size: 13px;
                    margin-bottom: 10px;
                    font-weight: 600;
                }
                .receipt-title {
                    font-size: 18px;
                    font-weight: bold;
                    margin: 15px 0 5px 0;
                    text-transform: uppercase;
                    border-top: 2px dashed #000;
                    padding-top: 10px;
                }
                .meta {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    margin-bottom: 5px;
                    border-bottom: 2px dashed #000;
                    padding-bottom: 10px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                }
                th {
                    border-bottom: 1px solid #000;
                    text-align: left;
                    font-size: 12px;
                    padding-bottom: 5px;
                }
                td {
                    padding: 8px 0;
                    vertical-align: top;
                    font-size: 13px;
                }
                .item-name { text-align: left; width: 40%; font-size: 13px; }
                .price { text-align: right; width: 20%; font-family: monospace; font-size: 13px; }
                .qty { text-align: center; width: 15%; font-family: monospace; font-size: 13px; font-weight: 600; }
                .amount { text-align: right; width: 25%; font-family: monospace; font-weight: bold; font-size: 13px; }
                .totals {
                    border-top: 2px dashed #000;
                    padding-top: 8px;
                    margin-top: 8px;
                    font-size: 12px;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 4px;
                    font-family: monospace;
                }
                .grand-total {
                    font-size: 20px;
                    font-weight: 900;
                    margin: 10px 0;
                    padding: 5px 0;
                    border-top: 1px solid #000;
                    border-bottom: 1px solid #000;
                }
                .footer {
                    margin-top: 20px;
                    font-size: 14px;
                    font-weight: bold;
                    border-top: 2px dashed #000;
                    padding-top: 15px;
                }
                .discount-note {
                    font-size: 10px;
                    font-weight: normal;
                    margin-top: 5px;
                    font-style: italic;
                }
                @media print {
                    body { margin: 0; }
                    .brand-logo { -webkit-print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="brand-logo">
                    <span class="brand-fashion">FASHION</span>
                    <span class="brand-shaa">SHAA</span>
                </div>
                <div class="shop-info">
                    
                    188, Kachcheri Idiripita,<br>
                    Kada 12, Anuradhapura.<br>
                    Tel: 025 2053465
                </div>

                <div class="receipt-title">Sales Receipt</div>
                
                <div class="meta">
                    <div>Date: ${dateStr}</div>
                    <div>Time: ${timeStr}</div>
                </div>
                <div style="text-align: left; font-size: 12px; margin-top: 5px;">
                    Employee: #${employeeId}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="text-align: left;">PRODUCT</th>
                            <th style="text-align: right;">PRICE</th>
                            <th style="text-align: center;">QTY</th>
                            <th style="text-align: right;">AMOUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="totals">
                    <div class="total-row">
                        <span>LINE ITEMS:</span>
                        <span>${items.length}</span>
                    </div>
                    <div class="total-row">
                        <span>TOTAL QUANTITY:</span>
                        <span>${items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                    </div>
                    <div class="total-row">
                        <span>NET AMOUNT:</span>
                        <span>${formatCurrency(rawTotal)}</span>
                    </div>
                    ${discountAmount > 0 ? `
                    <div class="total-row">
                        <span>${receiptDiscountLabel}:</span>
                        <span>-${formatCurrency(discountAmount)}</span>
                    </div>
                    ` : ''}
                    <div class="grand-total">
                        <span>TOTAL:</span>
                        <span>${formatCurrency(finalTotal)}</span>
                    </div>
                    <div class="total-row">
                        <span>CASH:</span>
                        <span>${formatCurrency(received)}</span>
                    </div>
                    <div class="total-row">
                        <span>Change:</span>
                        <span>${formatCurrency(change)}</span>
                    </div>
                </div>

                <div class="footer">
                    THANK YOU!<br>
                    COME AGAIN!
                </div>
                <div style="font-size: 10px; margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px; text-align: center; line-height: 1.5;">
                    <strong>REFUND POLICY</strong><br>
                    Products can be returned within 7 days<br>
                    with original receipt and tags attached.
                </div>
                ${discountAmount > 0 ? '<div class="discount-note">* Item eligible for discount</div>' : ''}
            </div>
        </body>
        </html>
    `;

    // Direct printing if in Electron and not in testing mode
    if (!TESTING_MODE && window.electronAPI && window.electronAPI.printReceipt) {
        window.electronAPI.printReceipt(receiptHtml);
    } else {
        // Show print preview (for testing or browser fallback)
        const printWindow = window.open('', '_blank', 'width=400,height=800');
        printWindow.document.write(receiptHtml);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    // Auto-start new sale after printing
    setTimeout(() => {
        startNewSale();
    }, 500);
}

// Quick checkout: Complete sale, print, and start new sale
function quickCheckout() {
    if (items.length === 0) return;
    printReceipt();
}

function startNewSale() {
    items = [];
    itemCounter = 0;
    renderItems();
    updateTotals();
    clearEntry();

    // Reset discount selection
    selectedDiscountRuleId = '';
    selectedDiscountValue = null;
    discountAmount = 0;
    const sel = document.getElementById('discountRuleSelect');
    if (sel) sel.value = '';
    const wrap = document.getElementById('discountRangeWrap');
    if (wrap) wrap.classList.add('hidden');
    const dd = document.getElementById('discountDisplay');
    if (dd) dd.classList.add('hidden');

    closeCheckout();
}

// ===== Visual Feedback =====
function shakeElement(element) {
    element.style.animation = 'none';
    element.offsetHeight; // Trigger reflow
    element.style.animation = 'shake 0.5s ease';
    setTimeout(() => element.style.animation = '', 500);
}

function pulseElement(element) {
    element.style.animation = 'none';
    element.offsetHeight;
    element.style.animation = 'pulse 0.3s ease';
    setTimeout(() => element.style.animation = '', 300);
}

// Add shake animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-5px); }
        40%, 80% { transform: translateX(5px); }
    }
    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
    }
`;
document.head.appendChild(style);

// ===== Event Listeners =====
// Number keys
document.querySelectorAll('.key.num').forEach(key => {
    key.addEventListener('click', () => appendNumber(key.dataset.value));
});

// Action keys
document.getElementById('backspace').addEventListener('click', backspace);
document.getElementById('clearEntry').addEventListener('click', clearEntry);
document.getElementById('addItem').addEventListener('click', () => addItemWithMultiplyCheck(false));

// Manual price input
priceDisplay.addEventListener('input', (e) => {
    // Remove any non-numeric characters except decimal point
    let value = e.target.value.replace(/[^0-9.]/g, '');

    // Ensure only one decimal point
    const decimalCount = (value.match(/\./g) || []).length;
    if (decimalCount > 1) {
        value = value.substring(0, value.lastIndexOf('.'));
    }

    // Limit decimal places to 2
    if (value.includes('.')) {
        const parts = value.split('.');
        if (parts[1] && parts[1].length > 2) {
            value = parts[0] + '.' + parts[1].substring(0, 2);
        }
    }

    currentPrice = value || '0';
    e.target.value = formatNumber(parseFloat(currentPrice) || 0);
});

// Handle keyboard shortcuts in price display
priceDisplay.addEventListener('keydown', (e) => {
    if (e.key === '*') {
        e.preventDefault();
        multiply();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        addItemWithMultiplyCheck(false);
    }
});

priceDisplay.addEventListener('focus', (e) => {
    // Select all text when focusing for easy replacement
    e.target.select();
});

priceDisplay.addEventListener('blur', (e) => {
    // Ensure proper formatting on blur
    currentPrice = parseFloat(currentPrice) > 0 ? currentPrice : '0';
    updateDisplay();
});

// Quantity controls
document.getElementById('qtyPlus').addEventListener('click', incrementQuantity);
document.getElementById('qtyMinus').addEventListener('click', decrementQuantity);

// Quick amounts
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => setQuickAmount(btn.dataset.amount));
});

// Clear all
document.getElementById('clearAll').addEventListener('click', clearAllItems);

// Multiply button
document.getElementById('multiply').addEventListener('click', multiply);

// Checkout
document.getElementById('checkout').addEventListener('click', openCheckout);
document.getElementById('closeModal').addEventListener('click', closeCheckout);
const discountRuleSelect = document.getElementById('discountRuleSelect');
if (discountRuleSelect) {
    discountRuleSelect.addEventListener('change', onDiscountRuleSelectChanged);
}
const discountValueInput = document.getElementById('discountValueInput');
if (discountValueInput) {
    discountValueInput.addEventListener('input', onDiscountRangeValueChanged);
}
amountReceivedInput.addEventListener('input', calculateChange);
document.getElementById('printReceipt').addEventListener('click', printReceipt);
document.getElementById('newSale').addEventListener('click', startNewSale);

// Item Selection Modal Events
closeItemModalBtn.addEventListener('click', closeItemSelectionModal);
confirmItemSelectionBtn.addEventListener('click', confirmItemSelection);

itemSelectionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === '+') {
        e.preventDefault();
        confirmItemSelection();
    } else if (e.key === 'Escape') {
        closeItemSelectionModal();
    }
});

itemSelectionInput.addEventListener('input', async (e) => {
    const val = e.target.value;
    if (val) {
        try {
            const item = await getInventoryItem(inventorySkuFromId(parseInt(val)));
            if (item) {
                itemPreview.textContent = item.name;
                itemPreview.style.color = 'var(--primary)';
                itemPreview.style.fontWeight = 'bold';
            } else {
                itemPreview.textContent = 'Unknown Item Number (Will use default name)';
                itemPreview.style.color = 'var(--text-secondary)';
                itemPreview.style.fontWeight = 'normal';
            }
        } catch (err) {
            console.error(err);
        }
    } else {
        itemPreview.textContent = 'Enter a number to see item name';
        itemPreview.style.color = 'var(--text-secondary)';
        itemPreview.style.fontWeight = 'normal';
    }
});

// Close modal on background click
checkoutModal.addEventListener('click', (e) => {
    if (e.target === checkoutModal) closeCheckout();
});

// ===== Barcode / Scanner Integration =====
// Adds a hidden input for barcode scanners that submit scans followed by Enter.
(function initBarcodeScanner() {
    try {
        const barcodeInput = document.createElement('input');
        barcodeInput.type = 'text';
        barcodeInput.id = 'barcodeInput';
        barcodeInput.autocomplete = 'off';
        barcodeInput.style.position = 'absolute';
        barcodeInput.style.left = '-10000px';
        barcodeInput.style.width = '1px';
        barcodeInput.style.height = '1px';
        document.body.appendChild(barcodeInput);

        // Focus the hidden input so scanners that act like keyboards will write into it
        // BUG-006 FIX: Only auto-focus if no other input is focused (prevents stealing focus from price display)
        setTimeout(() => {
            if (!document.activeElement || document.activeElement === document.body) {
                barcodeInput.focus();
            }
        }, 500);


        barcodeInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const raw = barcodeInput.value.trim();
                barcodeInput.value = '';
                if (!raw) return;
                await handleScannedCode(raw);
                // refocus so next scan goes to the hidden input
                setTimeout(() => barcodeInput.focus(), 50);
            }
        });

        // Fallback: also allow focusing the barcode input via Ctrl+B for manual testing
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'b') {
                barcodeInput.focus();
            }
        });
    } catch (err) {
        console.error('Barcode scanner initialization failed:', err);
    }
})();

/** Handle a scanned code string. Flow:
 * 1. Try DB lookup by exact SKU (GET /api/items/:sku)
 * 2. If not found and embedded-price parsing is enabled, attempt to parse price from the barcode string
 * 3. If still not resolved, open the item selection modal with the scanned value prefilled
 */
async function handleScannedCode(code) {
    // Normalization
    const normalized = code.trim();

    // 1) Try DB lookup
    try {
        const inventoryItem = await getInventoryItem(normalized);
        if (inventoryItem) {
            pendingItemToAdd = {
                name: inventoryItem.name || (`Item ${++itemCounter}`),
                price: (inventoryItem.price !== undefined && inventoryItem.price !== null) ? inventoryItem.price : parseFloat(currentPrice) || 0,
                quantity: 1,
                discountEligible: false,
                category: inventoryItem.category || '',
                sku: inventoryItem.sku || normalized
            };
            finalizeAddItem(pendingItemToAdd);
            return;
        }
    } catch (err) {
        // Lookup failed or item not found — continue to parsing
        console.log('Lookup by SKU failed for', normalized, err);
    }

    // 2) Call backend parser for more advanced formats (GS1, GTIN, price-embedded) if enabled
    const embeddedEnabled = localStorage.getItem('feature_embedded_price') !== 'false';
    if (embeddedEnabled) {
        try {
            const parsedResp = await fetchAPI('/barcode/parse', { method: 'POST', body: { code: normalized } });
            if (parsedResp) {
                // If backend returned an item, use it
                if (parsedResp.item) {
                    const inventoryItem = parsedResp.item;
                    pendingItemToAdd = {
                        name: inventoryItem.name || (`Item ${++itemCounter}`),
                        price: (inventoryItem.price !== undefined && inventoryItem.price !== null) ? inventoryItem.price : parseFloat(currentPrice) || 0,
                        quantity: 1,
                        discountEligible: false,
                        category: inventoryItem.category || '',
                        sku: inventoryItem.sku || normalized
                    };
                    finalizeAddItem(pendingItemToAdd);
                    return;
                }

                // If backend parsed a price, use it
                if (parsedResp.parsed && parsedResp.parsed.price) {
                    const p = parsedResp.parsed;
                    pendingItemToAdd = {
                        name: p.sku ? (`Item ${++itemCounter}`) : (`Item ${++itemCounter}`),
                        price: p.price,
                        quantity: 1,
                        discountEligible: false,
                        sku: p.sku || normalized,
                        priceFromBarcode: true
                    };
                    // Ask cashier to confirm price derived from barcode
                    try {
                        const ok = await showPriceConfirmation(pendingItemToAdd);
                        if (ok) finalizeAddItem(pendingItemToAdd);
                    } catch (e) {
                        console.error('Price confirmation failed', e);
                    }
                    return;
                }
            }
        } catch (parseErr) {
            console.log('Backend barcode parse failed:', parseErr);
        }
    }

    // 3) Fallback: attempt simple embedded-price parsing (format: SKU|PRICE or SKU:PRICE)
    const sepMatch = normalized.match(/(.+)[|:\\](\d+(?:\.\d{1,2})?)$/);
    if (sepMatch) {
        const sSku = sepMatch[1];
        const sPrice = parseFloat(sepMatch[2]);
        pendingItemToAdd = {
            name: `Item ${++itemCounter}`,
            price: sPrice,
            quantity: 1,
            discountEligible: false,
            sku: sSku,
            priceFromBarcode: true
        };
        try {
            const ok = await showPriceConfirmation(pendingItemToAdd);
            if (ok) finalizeAddItem(pendingItemToAdd);
        } catch (e) {
            console.error('Price confirmation failed', e);
        }
        return;
    }

    // 4) Final fallback: open item selection modal with scanned value prefilled to let cashier map it
    itemSelectionInput.value = normalized;
    openItemSelectionModal();
}

// Keyboard support
document.addEventListener('keydown', (e) => {
    // If keyboard shortcuts disabled via settings, ignore global inputs (except inside text inputs natively handled by browser)
    if (!enableKeyboardShortcuts) return;

    // Handle Enter in modal - print and new sale
    if (checkoutModal.classList.contains('active')) {
        if (e.key === 'Enter') {
            e.preventDefault();
            printReceipt();
            return;
        } else if (e.key === 'Escape') {
            closeCheckout();
            return;
        }

        // If the user is typing in modal input boxes, DO NOT call appendNumber
        // because the browser will handle it natively.
        const employeeIdInput = document.getElementById('employeeId');
        if (document.activeElement === amountReceivedInput ||
            document.activeElement === employeeIdInput) {
            return;
        }

        // Pass through number keys to appendNumber logic below
        // But stop valid keys from being "returned" early unless they are handled
        if (!((e.key >= '0' && e.key <= '9') || e.key === '.' || e.key === 'Backspace')) {
            return;
        }
        // If it IS a number/backspace, we let it fall through to the logic below
        // which calls appendNumber/backspace, which now handles the modal logic.
    }

    // F2 to open checkout/focus employee ID
    if (e.key === 'F2') {
        e.preventDefault();
        if (!checkoutModal.classList.contains('active')) {
            if (items.length > 0) openCheckout();
        }
        setTimeout(() => {
            const empInput = document.getElementById('employeeId');
            if (empInput) empInput.focus();
        }, 100);
        return;
    }

    // F3 to add item with discount eligibility
    if (e.key === 'F3') {
        e.preventDefault();
        quickAddWithDiscount();
        return;
    }

    // F4 to add item without discount eligibility
    if (e.key === 'F4') {
        e.preventDefault();
        quickAddWithoutDiscount();
        return;
    }

    // If item selection modal is open, don't handle keyboard input here
    // Let the modal's own event handlers deal with it
    if (itemSelectionModal && itemSelectionModal.classList.contains('active')) {
        return;
    }

    // CRITICAL: Don't intercept keyboard input when user is typing in ANY input field
    // This allows normal typing on employee page, settings page, items page, etc.
    const activeElement = document.activeElement;
    const isTypingInInput = activeElement &&
        (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable);

    if (isTypingInInput) {
        // Still allow Enter key in input fields on POS page for quick item addition
        if (e.key === 'Enter' && (activeElement === itemNameInput ||
            activeElement === itemCategorySelect ||
            activeElement === priceDisplay)) {
            e.preventDefault();
            addItemWithMultiplyCheck(false);
        }
        return;
    }

    if (e.key >= '0' && e.key <= '9') {
        appendNumber(e.key);
    } else if (e.key === '.') {
        appendNumber('.');
    } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
    } else if (e.key === '*') {
        e.preventDefault();
        multiply();
    } else if (e.key === '+') {
        e.preventDefault();
        addItemWithMultiplyCheck(false);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        // If there's a price entered, just add the item (don't open checkout)
        if (parseFloat(currentPrice) > 0) {
            addItem(false);
        } else if (items.length > 0) {
            // Only open checkout if there's no price (empty entry) and items exist
            openCheckout();
        }
    } else if (e.key === 'Escape') {
        clearEntry();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        incrementQuantity();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        decrementQuantity();
    }
});

// Initialize
updateDisplay();
updateTotals();

// Initialize database
if (typeof initDatabase === 'function') {
    initDatabase().then(() => {
        console.log('Database initialized successfully');
    }).catch(err => {
        console.error('Database initialization failed:', err);
    });
}
async function loadCustomersForCheckout() {
    try {
        if(typeof getAllCustomers === 'function') {
            const custs = await getAllCustomers();
            const sel = document.getElementById('checkoutCustomer');
            if(sel && custs) {
                custs.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.className = 'bg-slate-800 text-slate-300';
                    opt.textContent = `${c.name} (${c.phone})`;
                    sel.appendChild(opt);
                });
            }
        }
    } catch(e) { console.error("Could not load customers for checkout", e); }
}

// Call on startup
setTimeout(loadCustomersForCheckout, 1500);

/* placeholder aria-label */
