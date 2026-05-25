import { state, emit } from './state.js';
import { clearEntry } from './calculator.js';

function getStorage() {
    return window.POS_API?.storage || {
        getItem(key) {
            try {
                return window.localStorage?.getItem(key) ?? null;
            } catch {
                return null;
            }
        }
    };
}

export function addItem(discountEligible, itemName = '', category = '', skipPopup = false) {
    const price = parseFloat(state.currentPrice);
    if (price <= 0) {
        emit('cart:invalid_price');
        return;
    }

    state.pendingItemToAdd = {
        price,
        quantity: state.currentQuantity,
        discountEligible,
        category
    };

    if (itemName.trim() !== '') {
        state.pendingItemToAdd.name = itemName.trim();
        finalizeAddItem(state.pendingItemToAdd);
        return;
    }

    const useItemPopup = getStorage().getItem('useItemNumberPopup') === 'true';
    if (useItemPopup && !skipPopup) {
        emit('modal:open_item_selection');
    } else {
        state.itemCounter++;
        state.pendingItemToAdd.name = `Item ${state.itemCounter}`;
        finalizeAddItem(state.pendingItemToAdd);
    }
}

export function finalizeAddItem(itemData) {
    const lineTotal = itemData.price * itemData.quantity;
    
    const item = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        name: itemData.name,
        category: itemData.category,
        price: itemData.price,
        quantity: itemData.quantity,
        total: lineTotal,
        discountEligible: itemData.discountEligible
    };

    state.items.push(item);
    state.pendingItemToAdd = null;
    
    emit('cart:updated');
    clearEntry();
    emit('cart:item_added'); // for pulse effect
}

export function removeItem(id) {
    state.items = state.items.filter(item => item.id !== id);
    emit('cart:updated');
}

function resetCartState() {
    state.items = [];
    state.itemCounter = 0;
    emit('cart:updated');
    clearEntry();
}

export function clearAllItems() {
    if (state.items.length === 0) return;
    if (confirm('Are you sure you want to clear all items?')) {
        resetCartState();
    }
}

export function finalizeSaleReset() {
    if (state.items.length === 0) return;
    resetCartState();
}

export function computeDiscountAmount(rule, rawTotal) {
    if (!rule) return 0;
    if (rule.minPurchase && rawTotal < Number(rule.minPurchase)) return 0;

    const eligibleItems = state.items.filter(it => {
        if (!it.discountEligible) return false;
        if (rule.appliesTo && rule.appliesTo !== 'all') {
            return String(it.category || '') === String(rule.appliesTo);
        }
        return true;
    });

    const eligibleTotal = eligibleItems.reduce((sum, it) => sum + it.total, 0);
    if (eligibleTotal <= 0) return 0;

    if (rule.type === 'bogo') return 0;

    const isRange = rule.valueType === 'range';

    if (rule.type === 'percentage') {
        const pct = isRange ? Number(state.selectedDiscountValue || 0) : Number(rule.value || 0);
        if (pct <= 0) return 0;
        return eligibleTotal * (pct / 100);
    }

    if (rule.type === 'fixed') {
        const amt = isRange ? Number(state.selectedDiscountValue || 0) : Number(rule.value || 0);
        if (amt <= 0) return 0;
        return Math.min(amt, eligibleTotal);
    }

    return 0;
}

export function calculateTotals() {
    const subtotal = state.items.reduce((sum, item) => sum + item.total, 0);
    const totalItemsCount = state.items.reduce((sum, item) => sum + item.quantity, 0);

    const rule = getSelectedDiscountRule();
    state.discountAmount = computeDiscountAmount(rule, subtotal);
    const displayTotal = subtotal - state.discountAmount;

    return {
        subtotal,
        totalItemsCount,
        discountAmount: state.discountAmount,
        displayTotal,
        hasItems: state.items.length > 0
    };
}

export function getSelectedDiscountRule() {
    return state.discountRulesCache.find(r => String(r.id) === String(state.selectedDiscountRuleId)) || null;
}
