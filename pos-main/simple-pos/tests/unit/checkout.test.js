import { state } from '../../js/state.js';
import * as checkout from '../../js/checkout.js';

describe('Checkout receipt retry flow', () => {
    beforeEach(() => {
        state.items = [
            {
                id: 'item-1',
                name: 'Item 1',
                category: '',
                price: 120,
                quantity: 1,
                total: 120,
                discountEligible: false
            }
        ];
        state.itemCounter = 1;
        state.discountRulesCache = [];
        state.selectedDiscountRuleId = '';
        state.selectedDiscountValue = null;
        state.discountAmount = 0;
        state.pendingPrintReceipt = null;
        state.currentPrice = '0';
        state.currentQuantity = 1;
        state.multiplyMode = false;
        state.multiplyFirstValue = 0;
        state.testingMode = false;

        window.alert = jest.fn();
        window.confirm = jest.fn(() => true);
        window.POS_API = {
            getPosSettings: jest.fn().mockResolvedValue({
                saleEntryMode: 'manual_allowed',
                allowManualSales: true
            }),
            saveSale: jest.fn().mockResolvedValue({
                _id: 'abc123def456',
                receiptId: 'SALE-DEF456',
                saleDate: '2026-05-24',
                saleTime: '23:59:00'
            }),
            whenDatabaseReady: jest.fn().mockResolvedValue(),
            addLoyaltyPoints: jest.fn().mockResolvedValue(),
            getSaleReceiptId: jest.fn((sale) => sale.receiptId || '')
        };
        window.electronAPI = {
            printReceipt: jest
                .fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce({ started: true })
        };
    });

    afterEach(() => {
        delete window.POS_API;
        delete window.electronAPI;
    });

    test('keeps saved sale pending after print failure and retries without resaving', async () => {
        const firstAttempt = await checkout.printReceiptAndSave('1', '', 'Walk-in Customer', '200');

        expect(firstAttempt).toBe(false);
        expect(window.POS_API.saveSale).toHaveBeenCalledTimes(1);
        expect(checkout.getPendingPrintReceipt()).toMatchObject({
            receiptReference: 'SALE-DEF456'
        });
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Sale saved as SALE-DEF456'));

        window.alert.mockClear();

        const retryAttempt = await checkout.printReceiptAndSave('', '', '', '0');

        expect(retryAttempt).toBe(true);
        expect(window.POS_API.saveSale).toHaveBeenCalledTimes(1);
        expect(checkout.getPendingPrintReceipt()).toBeNull();
        expect(state.items).toHaveLength(0);
        expect(window.alert).not.toHaveBeenCalled();
    });

    test('blocks manual checkout when inventory-only mode is active', async () => {
        window.POS_API.getPosSettings.mockResolvedValue({
            saleEntryMode: 'inventory_only',
            allowManualSales: false
        });

        const result = await checkout.printReceiptAndSave('1', '', 'Walk-in Customer', '200');

        expect(result).toBe(false);
        expect(window.POS_API.saveSale).not.toHaveBeenCalled();
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Inventory Only mode is active'));
    });
});
