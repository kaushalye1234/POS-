export const state = {
    testingMode: localStorage.getItem('pos_testing_mode') === 'true',
    enableKeyboardShortcuts: localStorage.getItem('enableKeyboardShortcuts') !== 'false',
    
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
    
    // Item Selection State
    pendingItemToAdd: null,

    // Auth (reads from database.js globals)
    user: window.getAuthUser ? window.getAuthUser() : null
};

export const eventTarget = new EventTarget();

export function emit(eventName, detail = {}) {
    eventTarget.dispatchEvent(new CustomEvent(eventName, { detail }));
}
