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

    const itemsHtml = items.map(item => `
        <tr>
            <td class="item-name">${escapeHtml(item.name)}</td>
            <td class="qty">${escapeHtml(String(item.quantity))}</td>
            <td class="amount">${formatCurrency(item.total)}</td>
        </tr>
    `).join('');

    const discountRow = totals.discountAmount > 0
        ? `<div class="amount-row"><span>Discount:</span><span>-${formatCurrency(totals.discountAmount)}</span></div>`
        : '';

    const addressHtml = STORE_ADDRESS_LINES
        .map((line) => `<p class="store-line">${escapeHtml(line)}</p>`)
        .join('');

    return `
        <html>
        <head>
            <style>
                body {
                    font-family: Arial, Helvetica, sans-serif;
                    margin: 0;
                    padding: 14px;
                    width: 300px;
                    font-size: 12px;
                    color: #111;
                    background: #fff;
                }
                .receipt-shell { width: 100%; }
                .logo {
                    display: flex;
                    justify-content: center;
                    align-items: stretch;
                    margin-bottom: 16px;
                }
                .logo-block {
                    color: #fff;
                    font-weight: 900;
                    font-size: 22px;
                    line-height: 1;
                    padding: 18px 16px;
                    letter-spacing: 0.5px;
                }
                .logo-block.red { background: #e1261c; }
                .logo-block.black { background: #000; }
                .store-details { text-align: center; margin-bottom: 12px; }
                .store-line {
                    margin: 0 0 3px 0;
                    font-size: 11px;
                    font-weight: 600;
                }
                .dash {
                    border-top: 2px dashed #111;
                    margin: 14px 0;
                }
                .title {
                    text-align: center;
                    font-size: 18px;
                    font-weight: 900;
                    letter-spacing: 0.3px;
                    margin: 0;
                }
                .meta-row,
                .amount-row {
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    margin: 0 0 6px 0;
                    font-size: 11px;
                }
                .meta-row span:last-child,
                .amount-row span:last-child {
                    text-align: right;
                }
                .receipt-ref {
                    font-size: 10px;
                    font-weight: 700;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 0;
                }
                th, td {
                    padding: 5px 0;
                    font-size: 11px;
                    vertical-align: top;
                }
                th {
                    border-bottom: 1px solid #111;
                    font-weight: 900;
                }
                th.qty, td.qty {
                    text-align: center;
                    width: 44px;
                }
                th.amount, td.amount {
                    text-align: right;
                    width: 94px;
                }
                .item-name {
                    word-break: break-word;
                    padding-right: 8px;
                }
                .rule {
                    border-top: 1px solid #111;
                    margin: 12px 0;
                }
                .total-banner {
                    text-align: center;
                    font-size: 18px;
                    font-weight: 900;
                    margin: 12px 0;
                }
                .footer {
                    text-align: center;
                    font-size: 11px;
                    font-weight: 900;
                    line-height: 1.35;
                    margin-top: 12px;
                }
            </style>
        </head>
        <body>
            <div class="receipt-shell">
                <div class="logo">
                    <div class="logo-block red">FASHION</div>
                    <div class="logo-block black">SHAA</div>
                </div>
                <div class="store-details">
                    ${addressHtml}
                </div>

                <div class="dash"></div>
                <h1 class="title">SALES RECEIPT</h1>

                <div class="meta-row" style="margin-top: 14px;">
                    <span>Date: ${escapeHtml(dateStr)}</span>
                    <span>Time: ${escapeHtml(timeStr)}</span>
                </div>

                <div class="dash"></div>

                <div class="meta-row">
                    <span>Employee: #${escapeHtml(employeeId)}</span>
                    <span class="receipt-ref">Receipt: ${escapeHtml(receiptId)}</span>
                </div>

                <div style="margin-top: 14px;">
                    <table>
                        <thead>
                            <tr>
                                <th>ITEM</th>
                                <th class="qty">QTY</th>
                                <th class="amount">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                </div>

                <div class="dash"></div>

                <div class="amount-row"><span>Subtotal:</span><span>${formatCurrency(totals.subtotal)}</span></div>
                ${discountRow}

                <div class="rule"></div>
                <div class="total-banner">TOTAL: ${formatCurrency(totals.finalTotal)}</div>
                <div class="rule"></div>

                <div class="amount-row"><span>Amount Received:</span><span>${formatCurrency(totals.received)}</span></div>
                <div class="amount-row"><span>${settlement.label}:</span><span>${formatCurrency(settlement.amount)}</span></div>

                <div class="dash"></div>

                <div class="footer">
                    <div>THANK YOU!</div>
                    <div>COME AGAIN!</div>
                    <div>COME WITHIN 7 DAYS</div>
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
