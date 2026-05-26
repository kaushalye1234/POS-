import { state, eventTarget } from '../../js/state.js';
import * as cart from '../../js/cart.js';
import * as calc from '../../js/calculator.js';

describe('Cart Module', () => {
    beforeEach(() => {
        state.items = [];
        state.currentPrice = '0';
        state.currentQuantity = 1;
        state.itemCounter = 0;
        state.discountRulesCache = [];
        state.selectedDiscountRuleId = '';
        state.selectedDiscountValue = null;
        state.pendingItemToAdd = null;
    });

    test('addItem adds item with generated name if no name provided', () => {
        state.currentPrice = '150';
        state.currentQuantity = 2;
        
        // Mock skipping popup
        cart.addItem(false, '', 'Category', true);
        
        expect(state.items.length).toBe(1);
        expect(state.items[0].name).toBe('Item 1');
        expect(state.items[0].price).toBe(150);
        expect(state.items[0].quantity).toBe(2);
        expect(state.items[0].total).toBe(300);
        expect(state.items[0].discountEligible).toBe(false);
    });

    test('addItem adds item with specific name', () => {
        state.currentPrice = '500';
        
        cart.addItem(true, 'Test Shirt', 'Shirt');
        
        expect(state.items.length).toBe(1);
        expect(state.items[0].name).toBe('Test Shirt');
        expect(state.items[0].category).toBe('Shirt');
        expect(state.items[0].discountEligible).toBe(true);
    });

    test('addItem preserves inventory metadata when provided', () => {
        state.currentPrice = '250';

        cart.addItem(true, 'Inventory Item', 'Shirt', true, {
            sku: 'SKU-001',
            entryMode: 'inventory'
        });

        expect(state.items[0].sku).toBe('SKU-001');
        expect(state.items[0].entryMode).toBe('inventory');
    });

    test('removeItem removes correct item', () => {
        state.currentPrice = '100';
        cart.addItem(false, 'Item A', '', true);
        
        state.currentPrice = '200';
        cart.addItem(false, 'Item B', '', true);
        
        const idToRemove = state.items[0].id;
        
        cart.removeItem(idToRemove);
        
        expect(state.items.length).toBe(1);
        expect(state.items[0].name).toBe('Item B');
    });

    test('calculateTotals computes subtotal and grand total correctly without discount', () => {
        state.currentPrice = '100';
        state.currentQuantity = 2;
        cart.addItem(false, 'Item A', '', true); // 200
        
        state.currentPrice = '50';
        state.currentQuantity = 1;
        cart.addItem(false, 'Item B', '', true); // 50
        
        const totals = cart.calculateTotals();
        
        expect(totals.subtotal).toBe(250);
        expect(totals.totalItemsCount).toBe(3);
        expect(totals.discountAmount).toBe(0);
        expect(totals.displayTotal).toBe(250);
    });

    test('computeDiscountAmount applies percentage discount to eligible items', () => {
        // Add eligible item
        state.currentPrice = '100';
        cart.addItem(true, 'Eligible', '', true); // 100
        
        // Add non-eligible item
        state.currentPrice = '200';
        cart.addItem(false, 'Not Eligible', '', true); // 200
        
        const rule = {
            id: 'rule1',
            type: 'percentage',
            value: 10, // 10%
            appliesTo: 'all'
        };
        
        const totals = cart.calculateTotals();
        const discount = cart.computeDiscountAmount(rule, totals.subtotal);
        
        // 10% of 100 = 10
        expect(discount).toBe(10);
    });
});
