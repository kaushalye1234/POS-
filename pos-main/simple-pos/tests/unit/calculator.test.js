import { state, eventTarget } from '../../js/state.js';
import * as calc from '../../js/calculator.js';

describe('Calculator Module', () => {
    let emittedEvents = [];

    beforeEach(() => {
        // Reset state
        state.currentPrice = '0';
        state.currentQuantity = 1;
        state.multiplyMode = false;
        state.multiplyFirstValue = 0;
        emittedEvents = [];
    });

    // Capture emitted events
    eventTarget.addEventListener('display:update', () => emittedEvents.push('display:update'));
    eventTarget.addEventListener('quantity:update', () => emittedEvents.push('quantity:update'));

    test('appendNumber adds numbers correctly', () => {
        calc.appendNumber('7');
        expect(state.currentPrice).toBe('7');
        
        calc.appendNumber('5');
        expect(state.currentPrice).toBe('75');
        
        calc.appendNumber('.');
        calc.appendNumber('5');
        expect(state.currentPrice).toBe('75.5');
        
        expect(emittedEvents).toContain('display:update');
    });

    test('appendNumber prevents multiple decimals', () => {
        calc.appendNumber('1');
        calc.appendNumber('.');
        calc.appendNumber('5');
        calc.appendNumber('.'); // Should be ignored
        calc.appendNumber('0');
        expect(state.currentPrice).toBe('1.50');
    });

    test('appendNumber limits to 2 decimal places', () => {
        calc.appendNumber('1');
        calc.appendNumber('.');
        calc.appendNumber('9');
        calc.appendNumber('9');
        calc.appendNumber('9'); // Should be ignored
        expect(state.currentPrice).toBe('1.99');
    });

    test('backspace removes last character', () => {
        calc.appendNumber('1');
        calc.appendNumber('2');
        calc.appendNumber('3');
        
        calc.backspace();
        expect(state.currentPrice).toBe('12');
        
        calc.backspace();
        calc.backspace();
        expect(state.currentPrice).toBe('0');
    });

    test('clearEntry resets numpad state', () => {
        calc.appendNumber('5');
        calc.multiply(); // Enters multiply mode
        calc.incrementQuantity();
        
        calc.clearEntry();
        
        expect(state.currentPrice).toBe('0');
        expect(state.currentQuantity).toBe(1);
        expect(state.multiplyMode).toBe(false);
    });

    test('multiply sets multiplyMode and stores first value', () => {
        calc.appendNumber('2');
        calc.appendNumber('5');
        calc.appendNumber('0');
        
        calc.multiply();
        
        expect(state.multiplyMode).toBe(true);
        expect(state.multiplyFirstValue).toBe(250);
        expect(state.currentPrice).toBe('0'); // Ready for next input
    });

    test('setQuickAmount overrides current price', () => {
        calc.setQuickAmount('5000');
        expect(state.currentPrice).toBe('5000');
    });

    test('formatCurrency formats to Sri Lankan Rupees', () => {
        expect(calc.formatCurrency(1500.5)).toBe('Rs.1,500.50');
        expect(calc.formatCurrency(0)).toBe('Rs.0.00');
    });
});
