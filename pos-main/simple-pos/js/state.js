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

function getStoredFlag(key, fallback = false) {
    const value = getStorage().getItem(key);
    if (value == null) return fallback;
    return value === 'true';
}

export const state = {
    testingMode: getStoredFlag('pos_testing_mode', false),
    enableKeyboardShortcuts: getStorage().getItem('enableKeyboardShortcuts') !== 'false',
    
    // Calculator State
    currentPrice: '0',
    currentQuantity: 1,
    multiplyMode: false,
    multiplyFirstValue: 0,
    
    // Cart State
    items: [],
    itemCounter: 0,
    
    // Checkout State
    discountAmount: 0,
    discountRulesCache: [],
    selectedDiscountRuleId: '',
    selectedDiscountValue: null,
    pendingPrintReceipt: null,
    
    // Item Selection State
    pendingItemToAdd: null,

    // Auth (reads from database.js globals)
    user: window.getAuthUser ? window.getAuthUser() : null
};

export const eventTarget = new EventTarget();

export function emit(eventName, detail = {}) {
    eventTarget.dispatchEvent(new CustomEvent(eventName, { detail }));
}
