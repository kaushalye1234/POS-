// ============================================================
// Fashion Shaa POS - Shift Management Logic (v4)
// ============================================================

let activeShift = null;
let allShiftsData = [];

function formatCurrency(amt) {
    return 'Rs.' + (amt||0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getPreferredShiftEmployeeId() {
    const employeeId = window.POS_API?.getAuthUser?.()?.employeeId;
    const digits = String(employeeId || '').match(/\d+/)?.[0];
    return digits ? String(parseInt(digits, 10)) : '';
}

async function loadShifts() {
    allShiftsData = (await getAllShifts()) || [];
    activeShift = await getActiveShift();
    renderShiftUI();
    renderShiftsTable();
}

function renderShiftUI() {
    const activeBanner = document.getElementById('activeShiftBanner');
    const noBanner = document.getElementById('noShiftBanner');

    if (activeShift) {
        activeBanner.classList.remove('hidden');
        noBanner.classList.add('hidden');
        document.getElementById('activeShiftMeta').textContent =
            `Opened by ${activeShift.employeeId || '—'} at ${activeShift.openTime || '—'} on ${activeShift.date || '—'}`;
        document.getElementById('activeShiftFloat').textContent = formatCurrency(activeShift.openingFloat);
    } else {
        activeBanner.classList.add('hidden');
        noBanner.classList.remove('hidden');
    }
}

function renderShiftsTable() {
    const tbody = document.getElementById('shiftsTableBody');
    const sorted = [...allShiftsData].sort((a,b) => (b.id||0) - (a.id||0));
    if (!sorted.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-10 text-center text-slate-500 italic">No shift history</td></tr>';
        return;
    }
    tbody.innerHTML = sorted.map(s => {
        const diff = (s.closingCash || 0) - ((s.openingFloat||0) + (s.salesTotal||0));
        const diffClass = diff > 0 ? 'text-secondary' : diff < 0 ? 'text-red-400' : 'text-slate-400';
        const statusHtml = s.status === 'open'
            ? `<span class="px-2 py-0.5 bg-secondary/20 text-secondary text-xs font-bold rounded-full border border-secondary/30">OPEN</span>`
            : `<span class="px-2 py-0.5 bg-slate-700/50 text-slate-400 text-xs font-bold rounded-full border border-slate-600">CLOSED</span>`;
        return `
        <tr class="hover:bg-white/5 transition-colors">
            <td class="px-5 py-3 font-mono text-slate-300">#${s.id}</td>
            <td class="px-5 py-3 text-slate-400 text-xs">${s.date||'—'}</td>
            <td class="px-5 py-3 text-slate-300">${s.employeeId||'—'}</td>
            <td class="px-5 py-3 text-right font-semibold text-white">${formatCurrency(s.openingFloat)}</td>
            <td class="px-5 py-3 text-right font-semibold text-white">${s.closingCash != null ? formatCurrency(s.closingCash) : '—'}</td>
            <td class="px-5 py-3 text-right font-black ${diffClass}">${s.status==='closed' ? formatCurrency(diff) : '—'}</td>
            <td class="px-5 py-3 text-center">${statusHtml}</td>
        </tr>`;
    }).join('');
}

// ===== Open Shift =====
function openShiftDialog() {
    document.getElementById('noShiftBanner').classList.add('hidden');
    document.getElementById('openShiftForm').classList.remove('hidden');
    const employeeField = document.getElementById('openEmpId');
    const openingFloatField = document.getElementById('openingFloat');
    const preferredEmployeeId = getPreferredShiftEmployeeId();

    if (employeeField && !employeeField.value && preferredEmployeeId) {
        employeeField.value = preferredEmployeeId;
    }

    setTimeout(() => {
        if (employeeField && employeeField.value) {
            openingFloatField?.focus();
        } else {
            employeeField?.focus();
        }
    }, 100);
}
function cancelOpenShift() {
    document.getElementById('openShiftForm').classList.add('hidden');
    renderShiftUI();
}

async function confirmOpenShift() {
    const empIdRaw = document.getElementById('openEmpId').value.trim();
    const floatAmt = parseFloat(document.getElementById('openingFloat').value);
    const notes = document.getElementById('openNotes').value.trim();
    const confirmButton = document.querySelector('#openShiftForm button.bg-secondary');

    if (!empIdRaw) { alert('Please enter an employee ID.'); return; }
    if (isNaN(floatAmt) || floatAmt < 0) { alert('Please enter a valid opening cash float.'); return; }

    const now = new Date();
    const shift = {
        employeeId: 'E' + parseInt(empIdRaw),
        openingFloat: floatAmt,
        date: now.toISOString().split('T')[0],
        openTime: now.toTimeString().split(' ')[0],
        notes,
        status: 'open',
        createdAt: now.toISOString()
    };

    try {
        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.classList.add('opacity-70', 'cursor-not-allowed');
        }

        await saveShift(shift);
        document.getElementById('openShiftForm').classList.add('hidden');
        document.getElementById('openEmpId').value = '';
        document.getElementById('openingFloat').value = '';
        document.getElementById('openNotes').value = '';
        await loadShifts();
    } catch (error) {
        alert(error?.message || 'Failed to open the register.');
    } finally {
        if (confirmButton) {
            confirmButton.disabled = false;
            confirmButton.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    }
}

// ===== Close Shift =====
async function closeShiftDialog() {
    document.getElementById('activeShiftBanner').classList.add('hidden');
    document.getElementById('closeShiftForm').classList.remove('hidden');

    // Get today's sales to estimate cash
    const today = new Date().toISOString().split('T')[0];
    const todaySales = await getSalesByDateRange(today, today);
    const salesTotal = todaySales.reduce((s, sale) => s + (sale.totalAmount || 0), 0);
    activeShift.salesTotal = salesTotal;

    const expected = (activeShift.openingFloat || 0) + salesTotal;
    document.getElementById('rcOpenFloat').textContent = formatCurrency(activeShift.openingFloat);
    document.getElementById('rcSalesCash').textContent = formatCurrency(salesTotal);
    document.getElementById('rcExpected').textContent = formatCurrency(expected);
    document.getElementById('rcActual').textContent = formatCurrency(0);
    document.getElementById('rcDifference').textContent = formatCurrency(-expected);
    document.getElementById('rcDifference').className = 'font-black text-xl text-red-400';
}

function calculateReconciliation() {
    const actual = parseFloat(document.getElementById('closingCash').value) || 0;
    const openFloat = activeShift ? (activeShift.openingFloat || 0) : 0;
    const salesTotal = activeShift ? (activeShift.salesTotal || 0) : 0;
    const expected = openFloat + salesTotal;
    const diff = actual - expected;

    document.getElementById('rcActual').textContent = formatCurrency(actual);
    document.getElementById('rcDifference').textContent = formatCurrency(diff);
    document.getElementById('rcDifference').className = `font-black text-xl ${diff > 0 ? 'text-secondary' : diff < 0 ? 'text-red-400' : 'text-slate-300'}`;
}

function cancelCloseShift() {
    document.getElementById('closeShiftForm').classList.add('hidden');
    renderShiftUI();
}

async function confirmCloseShift() {
    const closingCash = parseFloat(document.getElementById('closingCash').value);
    if (isNaN(closingCash)) { alert('Please enter the actual cash count.'); return; }

    const openFloat = activeShift.openingFloat || 0;
    const salesTotal = activeShift.salesTotal || 0;
    const expected = openFloat + salesTotal;
    const diff = closingCash - expected;

    activeShift.closingCash = closingCash;
    activeShift.closeNotes = document.getElementById('closeNotes').value.trim();
    activeShift.status = 'closed';
    activeShift.closeTime = new Date().toTimeString().split(' ')[0];
    activeShift.salesTotal = salesTotal;
    activeShift.difference = diff;
    activeShift.closedAt = new Date().toISOString();

    try {
        await saveShift(activeShift);
        document.getElementById('closeShiftForm').classList.add('hidden');
        activeShift = null;
        await loadShifts();
    } catch (error) {
        alert(error?.message || 'Failed to close the register.');
    }
}

initDatabase().then(() => loadShifts());

/* placeholder aria-label */
