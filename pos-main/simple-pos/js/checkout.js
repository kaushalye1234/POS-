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
    const tryPopupPrint = () => new Promise((resolve) => {
        let printWindow = null;
        let settled = false;
        let printDispatched = false;

        const finish = (didStart) => {
            if (settled) return;
            settled = true;
            resolve(didStart);
        };

        try {
            printWindow = window.open('', '_blank', 'popup=yes,width=420,height=760');
        } catch (error) {
            console.error('Browser receipt popup could not be opened:', error);
            resolve(false);
            return;
        }

        if (!printWindow || printWindow.closed) {
            resolve(false);
            return;
        }

        const startPrint = async () => {
            if (printDispatched) return;
            printDispatched = true;

            try {
                await printWindow.document?.fonts?.ready?.catch?.(() => undefined);
                printWindow.addEventListener('afterprint', () => {
                    window.setTimeout(() => {
                        try {
                            if (!printWindow.closed) {
                                printWindow.close();
                            }
                        } catch {
                            // Ignore close errors after print.
                        }
                    }, 150);
                }, { once: true });

                printWindow.focus();
                printWindow.print();
                finish(true);
            } catch (error) {
                console.error('Browser popup print start failed:', error);
                try {
                    printWindow.close();
                } catch {
                    // Ignore cleanup errors when popup print fails.
                }
                finish(false);
            }
        };

        try {
            printWindow.document.open();
            printWindow.document.write(receiptHtml);
            printWindow.document.close();

            if (printWindow.document.readyState === 'complete') {
                window.setTimeout(startPrint, 120);
            } else {
                printWindow.addEventListener('load', () => {
                    window.setTimeout(startPrint, 120);
                }, { once: true });
            }

            window.setTimeout(() => {
                if (!settled) {
                    startPrint();
                }
            }, 700);
        } catch (error) {
            console.error('Browser popup receipt write failed:', error);
            try {
                printWindow.close();
            } catch {
                // Ignore close errors while falling back.
            }
            finish(false);
        }
    });

    return tryPopupPrint().then((popupResult) => {
        if (popupResult) {
            return true;
        }

        return new Promise((resolve) => {
            const printFrame = document.createElement('iframe');
            let settled = false;
            let receiptUrl = null;

            const removeFrame = () => {
                window.setTimeout(() => {
                    if (printFrame.parentNode) {
                        printFrame.remove();
                    }
                    if (receiptUrl) {
                        URL.revokeObjectURL(receiptUrl);
                        receiptUrl = null;
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
            printFrame.style.width = '360px';
            printFrame.style.height = '640px';
            printFrame.style.border = '0';
            printFrame.style.opacity = '0.01';
            printFrame.style.pointerEvents = 'none';
            printFrame.style.left = '-10000px';
            printFrame.style.top = '0';
            printFrame.style.background = '#fff';

            printFrame.onload = async () => {
                try {
                    const printWindow = printFrame.contentWindow;
                    if (!printWindow) {
                        finish(false);
                        return;
                    }

                    await printWindow.document?.fonts?.ready?.catch?.(() => undefined);
                    printWindow.addEventListener('afterprint', () => finish(true), { once: true });
                    window.setTimeout(() => {
                        try {
                            printWindow.focus();
                            printWindow.print();
                        } catch (error) {
                            console.error('Browser print start failed:', error);
                            finish(false);
                        }
                    }, 150);

                    // Some embedded print surfaces never fire afterprint reliably.
                    window.setTimeout(() => finish(true), 1200);
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
            receiptUrl = URL.createObjectURL(new Blob([receiptHtml], { type: 'text/html;charset=utf-8' }));
            printFrame.src = receiptUrl;
        });
    });
}

function getSaleReceiptReference(savedSale) {
    if (typeof window !== 'undefined' && window.POS_API && typeof window.POS_API.getSaleReceiptId === 'function') {
        return window.POS_API.getSaleReceiptId(savedSale);
    }

    if (!savedSale || typeof savedSale !== 'object') return '';

    const explicitReceiptId = String(savedSale.receiptId || '').trim();
    if (explicitReceiptId) return explicitReceiptId;

    const recordId = String(savedSale._id || savedSale.id || '').trim();
    return recordId ? `SALE-${recordId.slice(-6).toUpperCase()}` : '';
}

function setPendingPrintReceipt(pendingPrintReceipt) {
    state.pendingPrintReceipt = pendingPrintReceipt;
    emit('checkout:print_state_changed', { pendingPrintReceipt });
}

export function getPendingPrintReceipt() {
    return state.pendingPrintReceipt;
}

export function hasPendingPrintReceipt() {
    return Boolean(state.pendingPrintReceipt);
}

export function discardPendingPrintReceipt() {
    setPendingPrintReceipt(null);
}

async function attemptReceiptPrint(receiptHtml) {
    if (window.electronAPI && !state.testingMode) {
        try {
            const result = await window.electronAPI.printReceipt(receiptHtml);
            if (typeof result === 'boolean') return result;
            if (result && typeof result === 'object') {
                return result.started !== false && result.ok !== false && result.success !== false;
            }
            return true;
        } catch (error) {
            console.error('Electron receipt print failed:', error);
            return false;
        }
    }

    return printReceiptInBrowser(receiptHtml);
}

export async function printReceiptAndSave(employeeIdRaw, customerIdRaw, customerNameRaw, amountReceivedStr) {
    const pendingPrintReceipt = getPendingPrintReceipt();
    if (pendingPrintReceipt) {
        const printStarted = await attemptReceiptPrint(pendingPrintReceipt.receiptHtml);
        if (!printStarted) {
            alert(`Receipt printing still could not be started for ${pendingPrintReceipt.receiptReference || 'the saved sale'}. The sale is already saved. Click Retry Print again after checking the printer.`);
            return false;
        }

        discardPendingPrintReceipt();
        finalizeSaleReset();
        return true;
    }

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
    const saleSaver = window.POS_API?.saveSale || window.saveSale;
    const databaseReady = window.POS_API?.whenDatabaseReady;
    const loyaltyUpdater = window.POS_API?.addLoyaltyPoints || window.updateCustomerLoyaltyPoints;
    const posSettingsGetter = window.POS_API?.getPosSettings || window.getPosSettings;

    if (typeof saleSaver !== 'function') {
        alert('Sales API is not ready yet. Please try again in a moment.');
        return false;
    }

    try {
        if (typeof posSettingsGetter === 'function') {
            const posSettings = await posSettingsGetter();
            if (posSettings?.saleEntryMode === 'inventory_only') {
                const manualItems = state.items.filter((item) => !item.sku);
                if (manualItems.length > 0) {
                    const previewNames = manualItems
                        .slice(0, 3)
                        .map((item) => item.name || 'Manual item')
                        .join(', ');
                    const remainingCount = manualItems.length - Math.min(manualItems.length, 3);
                    const remainingLabel = remainingCount > 0 ? ` and ${remainingCount} more` : '';
                    alert(`Inventory Only mode is active, so manual price entries cannot be checked out. Remove or replace these lines with real inventory items first: ${previewNames}${remainingLabel}.`);
                    return false;
                }
            }
        }
    } catch (error) {
        console.warn('Could not load POS settings before checkout:', error);
    }

    try {
        if (typeof databaseReady === 'function') {
            await databaseReady();
        }

        savedSale = await saleSaver(
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
    } catch (err) {
        console.error('Failed to save sale:', err);
        alert(`Sale could not be saved: ${err?.message || err}. The receipt will not print and the cart will stay open.`);
        return false;
    }

    try {
        if (custId && typeof loyaltyUpdater === 'function') {
            const points = Math.floor(totals.displayTotal / 100); 
            await loyaltyUpdater(custId, points);
        }
    } catch (err) {
        console.warn('Sale saved, but loyalty points update failed:', err);
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
    const receiptReference = getSaleReceiptReference(savedSale) || 'this saved receipt';
    setPendingPrintReceipt({
        receiptHtml,
        receiptReference,
        savedSale
    });

    const printStarted = await attemptReceiptPrint(receiptHtml);

    if (!printStarted) {
        alert(`Sale saved as ${receiptReference}, but receipt printing did not start. Click Retry Print to try again. Use New Sale only if you want to print it later from Invoice History.`);
        return false;
    }

    discardPendingPrintReceipt();
    finalizeSaleReset();
    return true;
}
