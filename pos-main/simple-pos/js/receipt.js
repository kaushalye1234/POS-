export function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const STORE_ADDRESS_LINES = [
    '188, Kachcheri Idiripita,',
    'Kada 12, Anuradhapura.',
    'Tel: 025 2053465'
];
const STORE_BUSINESS_LINE = 'Textiles & Readymade Garments';
const RECEIPT_EQUAL_LINE = '========================================';
const RECEIPT_DASH_LINE = '----------------------------------------';

function getSaleRecordId(sale) {
    if (typeof window !== 'undefined' && window.POS_API && typeof window.POS_API.getSaleRecordId === 'function') {
        return window.POS_API.getSaleRecordId(sale);
    }
    if (!sale || typeof sale !== 'object') return '';
    const rawId = sale._id || sale.id;
    return rawId == null ? '' : String(rawId).trim();
}

function getSaleReceiptId(sale) {
    if (typeof window !== 'undefined' && window.POS_API && typeof window.POS_API.getSaleReceiptId === 'function') {
        return window.POS_API.getSaleReceiptId(sale);
    }
    if (!sale || typeof sale !== 'object') return '';
    const provided = String(sale.receiptId || '').trim();
    if (provided) return provided;
    const recordId = getSaleRecordId(sale);
    return recordId ? `SALE-${recordId.slice(-6).toUpperCase()}` : '';
}

function getReceiptTimestamp(sale) {
    if (!sale || typeof sale !== 'object') {
        return new Date();
    }

    const createdAt = sale.createdAt || sale.timestamp;
    if (createdAt) {
        const parsed = new Date(createdAt);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (sale.saleDate) {
        const parsed = new Date(`${sale.saleDate}T${sale.saleTime || '00:00:00'}`);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return new Date();
}

export function generateReceiptHtml(items, totals, employeeId, receiptDiscountLabel, savedSale = null) {
    const timestamp = getReceiptTimestamp(savedSale);
    const dateStr = timestamp.toLocaleDateString('en-LK');
    const timeStr = timestamp.toLocaleTimeString('en-LK');
    const receiptId = getSaleReceiptId(savedSale) || 'PENDING';
    const settlement = getSettlementSummary(totals.change);

    const itemsHtml = items.map((item) => `
        <div class="receipt-item-row">
            <span class="receipt-item-name">${escapeHtml(item.name)} x${escapeHtml(String(item.quantity))}</span>
            <span class="receipt-item-amount">${formatReceiptAmount(item.total)}</span>
        </div>
    `).join('');

    const discountRow = totals.discountAmount > 0
        ? `<div class="receipt-summary-row"><span>${escapeHtml(receiptDiscountLabel || 'Discount')}:</span><span>-${formatReceiptAmount(totals.discountAmount)}</span></div>`
        : '';

    const addressHtml = STORE_ADDRESS_LINES
        .map((line) => `<div class="receipt-center-line">${escapeHtml(line)}</div>`)
        .join('');

    return `
        <html>
        <head>
            <title>Receipt Preview</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@800&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    margin: 0;
                    padding: 40px 20px;
                    font-size: 14px;
                    line-height: 1.4;
                    text-align: center;
                    background: #f0f0f0;
                    color: #000;
                }
                .paper {
                    background: white;
                    padding: 20px;
                    max-width: 300px;
                    margin: 0 auto;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .brand-logo {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0;
                    font-weight: 800;
                    text-transform: uppercase;
                    font-family: 'Inter', sans-serif;
                    margin-bottom: 20px;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .brand-fashion {
                    background: #dc2626;
                    color: white;
                    padding: 6px 10px;
                    font-size: 20px;
                }
                .brand-shaa {
                    background: black;
                    color: white;
                    padding: 6px 12px;
                    font-size: 20px;
                }
                .receipt-text {
                    text-align: left;
                    display: inline-block;
                    width: 100%;
                    color: black;
                }
                .receipt-center-line {
                    text-align: center;
                }
                .receipt-business {
                    text-align: center;
                    margin-bottom: 2px;
                }
                .receipt-separator {
                    text-align: center;
                    font-weight: 700;
                    margin: 4px 0;
                    letter-spacing: 0.01em;
                }
                .receipt-title {
                    text-align: center;
                    font-family: 'Inter', sans-serif;
                    font-weight: 800;
                    font-size: 16px;
                    letter-spacing: 0.02em;
                    margin: 10px 0;
                }
                .receipt-meta-row,
                .receipt-summary-row,
                .receipt-item-row,
                .receipt-total-row {
                    display: flex;
                    justify-content: space-between;
                    gap: 10px;
                }
                .receipt-meta-row span:last-child,
                .receipt-summary-row span:last-child,
                .receipt-item-row span:last-child,
                .receipt-total-row span:last-child {
                    text-align: right;
                }
                .receipt-meta-row {
                    margin-bottom: 2px;
                }
                .receipt-items-header {
                    margin: 8px 0 4px;
                    font-weight: 700;
                }
                .receipt-item-row {
                    align-items: flex-start;
                    margin-bottom: 2px;
                }
                .receipt-item-name {
                    flex: 1;
                    padding-right: 10px;
                    word-break: break-word;
                }
                .receipt-item-amount {
                    min-width: 90px;
                }
                .receipt-total-row {
                    margin-top: 4px;
                    font-family: 'Inter', sans-serif;
                    font-size: 15px;
                    font-weight: 800;
                }
                .receipt-footer {
                    text-align: center;
                    font-family: 'Inter', sans-serif;
                    font-weight: 800;
                    margin-top: 8px;
                }
                @media print {
                    body {
                        background: #fff;
                        padding: 0;
                    }
                    .paper {
                        box-shadow: none;
                        margin: 0 auto;
                    }
                }
            </style>
        </head>
        <body>
            <div class="paper">
                <div class="brand-logo">
                    <span class="brand-fashion">FASHION</span>
                    <span class="brand-shaa">SHAA</span>
                </div>
                <div class="receipt-text">
                    <div class="receipt-separator">${RECEIPT_EQUAL_LINE}</div>
                    <div class="receipt-business">${escapeHtml(STORE_BUSINESS_LINE)}</div>
                    ${addressHtml}
                    <div class="receipt-separator">${RECEIPT_EQUAL_LINE}</div>
                    <div class="receipt-title">SALES RECEIPT</div>
                    <div class="receipt-meta-row">
                        <span>Date: ${escapeHtml(dateStr)}</span>
                        <span>Time: ${escapeHtml(timeStr)}</span>
                    </div>
                    <div class="receipt-meta-row">
                        <span>Employee: #${escapeHtml(employeeId)}</span>
                        <span>Receipt: ${escapeHtml(receiptId)}</span>
                    </div>
                    <div class="receipt-separator">${RECEIPT_DASH_LINE}</div>
                    <div class="receipt-item-row receipt-items-header">
                        <span>ITEM</span>
                        <span>TOTAL</span>
                    </div>
                    ${itemsHtml}
                    <div class="receipt-separator">${RECEIPT_DASH_LINE}</div>
                    <div class="receipt-summary-row"><span>Subtotal:</span><span>${formatReceiptAmount(totals.subtotal)}</span></div>
                    ${discountRow}
                    <div class="receipt-total-row"><span>TOTAL:</span><span>${formatReceiptAmount(totals.finalTotal)}</span></div>
                    <div class="receipt-summary-row"><span>Amount Received:</span><span>${formatReceiptAmount(totals.received)}</span></div>
                    <div class="receipt-summary-row"><span>${settlement.label}:</span><span>${formatReceiptAmount(settlement.amount)}</span></div>
                    <div class="receipt-separator">${RECEIPT_EQUAL_LINE}</div>
                    <div class="receipt-footer">THANK YOU!</div>
                    <div class="receipt-footer">COME AGAIN!</div>
                    <div class="receipt-footer">COME WITHIN 7 DAYS</div>
                </div>
            </div>
        </body>
        </html>
    `;
}

function getSettlementSummary(changeAmount) {
    const numericChange = Number(changeAmount || 0);
    if (numericChange < 0) {
        return {
            label: 'Due',
            amount: Math.abs(numericChange)
        };
    }

    return {
        label: 'Change',
        amount: numericChange
    };
}

function formatCurrency(amount) {
    return 'Rs.' + amount.toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatReceiptAmount(amount) {
    return Number(amount || 0).toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
