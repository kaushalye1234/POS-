import { state, emit } from './state.js';

export function formatNumber(num) {
    return num.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

export function formatCurrency(amount) {
    return 'Rs.' + amount.toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export function appendNumber(value, inCheckout = false, changeCallback = null) {
    if (inCheckout && changeCallback) {
        changeCallback(value);
        return;
    }

    if (state.currentPrice === '0' && value !== '.') {
        state.currentPrice = value;
    } else if (value === '.' && state.currentPrice.includes('.')) {
        return;
    } else if (value === '00' && state.currentPrice === '0') {
        return;
    } else {
        if (state.currentPrice.includes('.')) {
            const decimalPart = state.currentPrice.split('.')[1];
            if (decimalPart && decimalPart.length >= 2) return;
        }
        state.currentPrice += value;
    }
    emit('display:update');
}

export function backspace(inCheckout = false, changeCallback = null) {
    if (inCheckout && changeCallback) {
        changeCallback('backspace');
        return;
    }

    if (state.currentPrice.length > 1) {
        state.currentPrice = state.currentPrice.slice(0, -1);
    } else {
        state.currentPrice = '0';
    }
    emit('display:update');
}

export function clearEntry(inCheckout = false, changeCallback = null) {
    if (inCheckout && changeCallback) {
        changeCallback('clear');
        return;
    }

    if (state.currentPrice !== '0' || state.currentQuantity !== 1 || state.multiplyMode) {
        state.currentPrice = '0';
        state.currentQuantity = 1;
        state.multiplyMode = false;
        state.multiplyFirstValue = 0;
        emit('display:update');
        emit('quantity:update');
    } else {
        emit('entry:hard_clear'); // Let UI clear inputs
        state.currentPrice = '0';
        state.currentQuantity = 1;
        emit('display:update');
        emit('quantity:update');
    }
}

export function setQuickAmount(amount) {
    state.currentPrice = amount.toString();
    emit('display:update');
}

export function multiply() {
    const currentValue = parseFloat(state.currentPrice) || 0;
    if (!state.multiplyMode) {
        state.multiplyFirstValue = currentValue;
        state.multiplyMode = true;
        state.currentPrice = '0';
        emit('display:update');
    }
}

export function incrementQuantity() {
    state.currentQuantity++;
    emit('quantity:update');
}

export function decrementQuantity() {
    if (state.currentQuantity > 1) {
        state.currentQuantity--;
        emit('quantity:update');
    }
}
