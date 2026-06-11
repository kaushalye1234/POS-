import { state, emit } from './state.js';
import { calculateTotals, getSelectedDiscountRule, finalizeSaleReset } from './cart.js';
import { generateReceiptHtml } from './receipt.js';

export function calculateChange(amountReceivedStr) {
    const totals = calculateTotals();
    const received = parseFloat(amountReceivedStr) || 0;
    const change = received - totals.displayTotal;

    emit('checkout:change_calculated', {
        totals,
        received,
        change,
        isNegative: change < 0
    });
    
    return { totals, received, change };
}

function printReceiptInBrowser(receiptHtml) {
    return new Promise((resolve) => {
        const printFrame = document.createElement('iframe');
        let settled = false;

        const removeFrame = () => {
            window.setTimeout(() => {
                if (printFrame.parentNode) {
                    printFrame.remove();
                }
            }, 1000);
        };

        const finish = (didStart) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);

            if (didStart) {
                removeFrame();
            } else if (printFrame.parentNode) {
                printFrame.remove();
            }

            resolve(didStart);
        };

        printFrame.setAttribute('aria-hidden', 'true');
        printFrame.style.position = 'fixed';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        printFrame.style.opacity = '0';
        printFrame.style.pointerEvents = 'none';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';

        printFrame.onload = () => {
            try {
                const printWindow = printFrame.contentWindow;
                if (!printWindow) {
                    finish(false);
                    return;
                }

                printWindow.addEventListener('afterprint', () => finish(true), { once: true });
                printWindow.focus();
                printWindow.print();

                // Some embedded print surfaces never fire afterprint reliably.
                window.setTimeout(() => finish(true), 400);
            } catch (error) {
                console.error('Browser print fallback failed:', error);
                finish(false);
            }
        };

        const timeoutId = window.setTimeout(() => {
            console.error('Browser print fallback timed out before starting.');
            finish(false);
        }, 5000);

        document.body.appendChild(printFrame);
        printFrame.srcdoc = receiptHtml;
    });
}

export async function printReceiptAndSave(employeeIdRaw, customerIdRaw, customerNameRaw, amountReceivedStr) {
    const rawId = parseInt(employeeIdRaw);

    if (!rawId || rawId < 1) {
        alert('Please enter a valid Employee ID (1, 2, 3...)');
        return false;
    }

    const employeeId = 'E' + rawId;
    const { totals, received, change } = calculateChange(amountReceivedStr);
    
    const custId = customerIdRaw ? parseInt(customerIdRaw) : null;
    const custName = customerNameRaw || null;
    let savedSale = null;

    if (typeof window.saveSale === 'function' && window.db) {
        try {
            savedSale = await window.saveSale(
                employeeId, 
                totals.displayTotal, 
                received, 
                change, 
                state.items, 
                totals.discountAmount, 
                custId, 
                custName
            );
            console.log('Sale saved with record:', savedSale);
            
            if (custId && typeof window.updateCustomerLoyaltyPoints === 'function') {
                const points = Math.floor(totals.displayTotal / 100); 
                window.updateCustomerLoyaltyPoints(custId, points);
            }
        } catch (err) {
            console.error('Failed to save sale:', err);
            
            // Check for No Stock error
            if (err.error === 'No Stock' || (err.message && err.message.includes('No Stock'))) {
                const details = err.details || [];
                let msg = '⚠️ OUT OF STOCK WARNING\n\nThe following items do not have enough stock to complete this sale:\n\n';
                details.forEach(d => {
                    msg += `- ${d.itemName || d.sku} (SKU: ${d.sku}): Requested ${d.requested}, Available ${d.available}\n`;
                });
                msg += '\nWould you like an Admin/Manager to perform a Quick Restock?';
                
                if (confirm(msg)) {
                    // Try to request admin override via PIN
                    let pin = '';
                    if (window.requestAdminOverride) {
                        try {
                            const success = await window.requestAdminOverride('Admin/Manager PIN required to authorize Quick Restock.');
                            if (success) {
                                pin = prompt('Enter Admin/Manager PIN to confirm Quick Restock:');
                            }
                        } catch (pinErr) {
                            console.error('Admin override failed:', pinErr);
                        }
                    } else {
                        pin = prompt('Enter Admin/Manager PIN to authorize Quick Restock:');
                    }
                    
                    if (pin) {
                        try {
                            // Restock each out-of-stock item
                            for (const d of details) {
                                const missing = d.requested - d.available;
                                if (navigator.onLine) {
                                    if (window.POS_API && window.POS_API.quickRestockItem) {
                                        await window.POS_API.quickRestockItem(d.sku, pin, missing);
                                    } else {
                                        throw new Error('POS_API.quickRestockItem is unavailable.');
                                    }
                                } else {
                                    // Offline quick-restock: update items_cache.json locally
                                    const cachedItems = await window.electronAPI.readItemsCache();
                                    const item = cachedItems.find(i => i.sku === d.sku);
                                    if (item) {
                                        item.stockLevel = (item.stockLevel || 0) + missing;
                                        await window.electronAPI.writeItemsCache(cachedItems);
                                    }
                                }
                            }
                            alert('Quick Restock completed successfully! Retrying checkout...');
                            // Retry saving the sale
                            return await printReceiptAndSave(employeeIdRaw, customerIdRaw, customerNameRaw, amountReceivedStr);
                        } catch (restockErr) {
                            alert('Restock failed: ' + (restockErr.message || restockErr));
                            return false;
                        }
                    }
                }
                return false;
            } else if (err.error === 'Discount Limit Exceeded' || (err.message && err.message.includes('Discount Limit Exceeded'))) {
                alert('Checkout Rejected: ' + (err.message || 'Discount violates store profitability protection limits.'));
                return false;
            } else {
                alert('Checkout Failed: ' + (err.message || err));
                return false;
            }
        }
    }

    // Print Receipt
    let receiptDiscountLabel = 'Discount';
    const activeRule = getSelectedDiscountRule();
    if (activeRule) {
        const ruleName = activeRule.name || 'Discount';
        if (activeRule.type === 'percentage') {
            const pct = activeRule.valueType === 'range' ? state.selectedDiscountValue : activeRule.value;
            receiptDiscountLabel = `${ruleName} (${pct}%)`;
        } else if (activeRule.type === 'fixed') {
            const amt = activeRule.valueType === 'range' ? state.selectedDiscountValue : activeRule.value;
            receiptDiscountLabel = `${ruleName} (Rs.${amt})`;
        } else {
            receiptDiscountLabel = ruleName;
        }
    }

    const fullTotals = {
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        finalTotal: totals.displayTotal,
        received,
        change
    };

    const receiptHtml = generateReceiptHtml(state.items, fullTotals, employeeId, receiptDiscountLabel, savedSale);

    let printStarted = false;

    if (window.electronAPI && !state.testingMode) {
        try {
            window.electronAPI.printReceipt(receiptHtml);
            printStarted = true;
        } catch (error) {
            console.error('Electron receipt print failed:', error);
        }
    } else {
        printStarted = await printReceiptInBrowser(receiptHtml);
    }

    if (!printStarted) {
        alert('Printing could not be started. The sale is still open, so please try again.');
        return false;
    }

    finalizeSaleReset();
    return true;
}
