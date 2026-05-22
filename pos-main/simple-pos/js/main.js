import { state, eventTarget } from './state.js';
import * as calc from './calculator.js';
import * as cart from './cart.js';
import * as checkout from './checkout.js';
import * as barcode from './barcode.js';

// DOM Elements
const UI = {
    priceDisplay: document.getElementById('priceDisplay'),
    itemName: document.getElementById('itemName'),
    quantity: document.getElementById('quantity'),
    itemsList: document.getElementById('itemsList'),
    subtotal: document.getElementById('subtotal'),
    itemCount: document.getElementById('itemCount'),
    grandTotal: document.getElementById('grandTotal'),
    checkoutBtn: document.getElementById('checkout'),
    
    // Checkout Modal
    checkoutModal: document.getElementById('checkoutModal'),
    closeModalBtn: document.getElementById('closeModal'),
    printReceiptBtn: document.getElementById('printReceipt'),
    newSaleBtn: document.getElementById('newSale'),
    amountReceived: document.getElementById('amountReceived'),
    changeAmount: document.getElementById('changeAmount'),
    changeDisplay: document.getElementById('changeDisplay'),
    employeeId: document.getElementById('employeeId'),
    checkoutEmployeeHint: document.getElementById('checkoutEmployeeHint'),
    checkoutCustomer: document.getElementById('checkoutCustomer'),
    checkoutTotal: document.getElementById('checkoutTotal'),
    
    // Numpad
    keys: document.querySelectorAll('.key.num'),
    backspace: document.getElementById('backspace'),
    clearEntry: document.getElementById('clearEntry'),
    multiply: document.getElementById('multiply'),
    addItem: document.getElementById('addItem'),
    discOverride: document.getElementById('discOverride'),
    qtyPlus: document.getElementById('qtyPlus'),
    qtyMinus: document.getElementById('qtyMinus'),
    quickBtns: document.querySelectorAll('.quick-btn'),
    clearAll: document.getElementById('clearAll'),
    currentDate: document.getElementById('currentDate'),
    currentTime: document.getElementById('currentTime')
};

function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Initialize
function init() {
    bindEvents();
    startHeaderClock();
    barcode.setupBarcodeScanner();
    cart.calculateTotals(); // Initial zero state
    updateCartUI();
}

function updateHeaderClock() {
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

    if (UI.currentDate) UI.currentDate.textContent = dateStr;
    if (UI.currentTime) UI.currentTime.textContent = timeStr;
}

function startHeaderClock() {
    updateHeaderClock();
    window.setInterval(updateHeaderClock, 1000);
}

let hasInitialized = false;

function startApp() {
    if (hasInitialized) return;
    hasInitialized = true;
    init();
}

function normalizeCheckoutEmployeeId(employeeId) {
    if (employeeId == null) return '';

    const digits = String(employeeId).trim().match(/\d+/)?.[0];
    if (!digits) return '';

    const parsed = parseInt(digits, 10);
    return parsed > 0 ? String(parsed) : '';
}

function getDefaultCheckoutEmployeeId() {
    const authUser = window.POS_API?.getAuthUser?.();
    return normalizeCheckoutEmployeeId(authUser?.employeeId);
}

function hasValidCheckoutEmployeeId() {
    const rawId = parseInt(UI.employeeId?.value, 10);
    return Number.isInteger(rawId) && rawId > 0;
}

function updateCheckoutEmployeePriorityState({ report = false } = {}) {
    const isValid = hasValidCheckoutEmployeeId();

    if (UI.employeeId) {
        UI.employeeId.setCustomValidity(isValid ? '' : 'Enter Employee ID before continuing.');
        UI.employeeId.classList.toggle('border-rose-500', !isValid);
        UI.employeeId.classList.toggle('border-emerald-500', isValid);
    }

    if (UI.checkoutEmployeeHint) {
        UI.checkoutEmployeeHint.textContent = isValid
            ? 'Employee ID confirmed for this sale.'
            : 'Enter employee ID before payment.';
        UI.checkoutEmployeeHint.classList.toggle('text-rose-300', !isValid);
        UI.checkoutEmployeeHint.classList.toggle('text-emerald-300', isValid);
    }

    if (!isValid && report && UI.employeeId) {
        UI.employeeId.focus();
        UI.employeeId.reportValidity();
    }

    return isValid;
}

function focusPriorityCheckoutField() {
    const target = hasValidCheckoutEmployeeId() ? UI.amountReceived : UI.employeeId;
    target?.focus();
}

async function triggerCheckoutPrint() {
    if (!updateCheckoutEmployeePriorityState({ report: true })) {
        return false;
    }

    const success = await checkout.printReceiptAndSave(
        UI.employeeId?.value,
        UI.checkoutCustomer?.value,
        UI.checkoutCustomer?.options?.[UI.checkoutCustomer.selectedIndex]?.text,
        UI.amountReceived?.value
    );

    if (success) {
        UI.checkoutModal?.classList.remove('active');
    }

    return success;
}

function handleCheckoutKeydown(event) {
    if (event.key !== 'Enter') return;
    if (!UI.checkoutModal?.classList.contains('active')) return;

    event.preventDefault();

    if (event.target === UI.employeeId) {
        if (!updateCheckoutEmployeePriorityState({ report: true })) {
            return;
        }

        UI.amountReceived?.focus();
        return;
    }

    void triggerCheckoutPrint();
}

function bindEvents() {
    // Calculator & Numpad bindings
    UI.keys?.forEach(btn => {
        btn.addEventListener('click', () => calc.appendNumber(btn.dataset.value));
    });
    
    UI.backspace?.addEventListener('click', () => calc.backspace());
    UI.clearEntry?.addEventListener('click', () => calc.clearEntry());
    UI.multiply?.addEventListener('click', () => calc.multiply());
    
    // Quick Cash buttons (used for direct entry before add item)
    UI.quickBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
            calc.setQuickAmount(btn.dataset.amount);
        });
    });

    UI.qtyPlus?.addEventListener('click', () => calc.incrementQuantity());
    UI.qtyMinus?.addEventListener('click', () => calc.decrementQuantity());

    // Add items
    UI.addItem?.addEventListener('click', () => {
        cart.addItem(false, UI.itemName.value, '');
    });
    
    UI.discOverride?.addEventListener('click', () => {
        cart.addItem(true, UI.itemName.value, '');
    });

    UI.clearAll?.addEventListener('click', () => cart.clearAllItems());

    // Checkout Modal bindings
    UI.checkoutBtn?.addEventListener('click', () => {
        if (!cart.calculateTotals().hasItems) return;
        UI.employeeId.value = getDefaultCheckoutEmployeeId();
        UI.amountReceived.value = '';
        checkout.calculateChange('');
        updateCheckoutEmployeePriorityState();
        UI.checkoutModal.classList.add('active');
        setTimeout(() => focusPriorityCheckoutField(), 100);
    });

    UI.closeModalBtn?.addEventListener('click', () => {
        UI.checkoutModal.classList.remove('active');
    });

    UI.employeeId?.addEventListener('input', () => {
        updateCheckoutEmployeePriorityState();
    });

    UI.amountReceived?.addEventListener('input', (e) => {
        checkout.calculateChange(e.target.value);
    });

    UI.employeeId?.addEventListener('keydown', handleCheckoutKeydown);
    UI.amountReceived?.addEventListener('keydown', handleCheckoutKeydown);
    UI.checkoutCustomer?.addEventListener('keydown', handleCheckoutKeydown);
    UI.printReceiptBtn?.addEventListener('keydown', handleCheckoutKeydown);

    UI.printReceiptBtn?.addEventListener('click', async () => {
        await triggerCheckoutPrint();
    });

    UI.newSaleBtn?.addEventListener('click', () => {
        cart.clearAllItems();
        UI.checkoutModal.classList.remove('active');
    });

    eventTarget.addEventListener('checkout:change_calculated', (e) => {
        const { totals, change, isNegative } = e.detail;
        if (UI.checkoutTotal) UI.checkoutTotal.textContent = calc.formatCurrency(totals.displayTotal);
        if (UI.changeAmount) UI.changeAmount.textContent = calc.formatCurrency(Math.abs(change));
        if (UI.changeDisplay) {
            UI.changeDisplay.querySelector('span').textContent = isNegative ? 'DUE' : 'CHANGE';
            UI.changeDisplay.classList.toggle('text-rose-500', isNegative);
            UI.changeAmount.classList.toggle('text-emerald-400', !isNegative);
            UI.changeAmount.classList.toggle('text-rose-500', isNegative);
        }
    });

    // Event listeners from State
    eventTarget.addEventListener('display:update', updateDisplayUI);
    eventTarget.addEventListener('quantity:update', updateQuantityUI);
    eventTarget.addEventListener('cart:updated', updateCartUI);
    eventTarget.addEventListener('entry:hard_clear', () => {
        UI.itemName.value = '';
    });

    document.addEventListener('keydown', handleGlobalKeyboard);
}

function handleGlobalKeyboard(event) {
    if (event.defaultPrevented) return;
    if (!state.enableKeyboardShortcuts) return;

    const isCheckoutOpen = UI.checkoutModal?.classList.contains('active');
    if (isCheckoutOpen) {
        if (event.key === 'Enter') {
            event.preventDefault();
            void triggerCheckoutPrint();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            UI.closeModalBtn?.click();
            return;
        }
    }

    const activeElement = document.activeElement;
    const isTypingInField = activeElement &&
        (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable);

    if (isTypingInField) {
        const isPosEntryField = activeElement === UI.itemName ||
            activeElement === UI.priceDisplay;

        if (event.key === 'Enter' && isPosEntryField) {
            event.preventDefault();
            UI.addItem?.click();
        }
        return;
    }

    if (event.key >= '0' && event.key <= '9') {
        calc.appendNumber(event.key);
        return;
    }

    if (event.key === '.') {
        calc.appendNumber('.');
        return;
    }

    if (event.key === 'Backspace') {
        event.preventDefault();
        calc.backspace();
        return;
    }

    if (event.key === '+') {
        event.preventDefault();
        UI.addItem?.click();
        return;
    }

    if (event.key === '*') {
        event.preventDefault();
        calc.multiply();
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        calc.incrementQuantity();
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        calc.decrementQuantity();
        return;
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        calc.clearEntry();
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();

        if ((parseFloat(state.currentPrice) || 0) > 0) {
            UI.addItem?.click();
            return;
        }

        if (state.items.length > 0) {
            UI.employeeId.value = getDefaultCheckoutEmployeeId();
            updateCheckoutEmployeePriorityState();
            UI.checkoutBtn?.click();
        }
    }
}

function updateDisplayUI() {
    if (UI.priceDisplay) {
        UI.priceDisplay.value = calc.formatNumber(parseFloat(state.currentPrice) || 0);
    }
}

function updateQuantityUI() {
    if (UI.quantity) {
        UI.quantity.textContent = state.currentQuantity;
    }
}

function updateCartUI() {
    const totals = cart.calculateTotals();
    
    if (UI.subtotal) UI.subtotal.textContent = calc.formatCurrency(totals.subtotal);
    if (UI.itemCount) UI.itemCount.textContent = totals.totalItemsCount;
    if (UI.grandTotal) UI.grandTotal.textContent = calc.formatCurrency(totals.displayTotal);
    if (UI.checkoutBtn) UI.checkoutBtn.disabled = !totals.hasItems;

    renderItemsList();
}

function renderItemsList() {
    if (!UI.itemsList) return;

    if (state.items.length === 0) {
        UI.itemsList.innerHTML = `
            <div style="text-align: center; padding: 2rem 0; opacity: 0.6;">
                <span style="font-size: 2rem; display: block; margin-bottom: 0.3rem;">📝</span>
                <p>No items added yet</p>
                <p style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.2rem;">Enter a price and tap +</p>
            </div>
        `;
        return;
    }

    UI.itemsList.innerHTML = state.items.map(item => `
        <div class="item-row" data-id="${item.id}">
            <div class="item-info">
                <div class="item-name">
                    ${escapeHtml(item.name) || 'Item'}
                    ${item.discountEligible ? '<span style="color: var(--accent-warning); font-size: 0.7rem; margin-left: 4px;">Discount</span>' : ''}
                </div>
                <div class="item-details">
                    ${item.category ? `${escapeHtml(item.category)} • ` : ''}${calc.formatCurrency(item.price)} x ${item.quantity}
                </div>
            </div>
            <div class="item-price">${calc.formatCurrency(item.total)}</div>
            <button class="item-delete" data-id="${item.id}" title="Remove item">×</button>
        </div>
    `).join('');

    // Rebind delete buttons
    UI.itemsList.querySelectorAll('.item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            cart.removeItem(e.currentTarget.dataset.id);
        });
    });

    UI.itemsList.scrollTop = UI.itemsList.scrollHeight;
}

// Start app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
    startApp();
}
