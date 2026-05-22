// ============================================================
// Fashion Shaa POS - Employee Advances & Deductions Logic (v5)
// ============================================================

let allAdvances = [];
let allEmployees = [];

function escHtml(text) { const d = document.createElement('div'); d.textContent = text||''; return d.innerHTML; }
function formatCurrency(amt) { return 'Rs.' + parseFloat(amt||0).toLocaleString('en-LK', {minimumFractionDigits:2,maximumFractionDigits:2}); }

async function init() {
    await initDatabase();
    await loadEmployees();
    await loadAdvances();
    document.getElementById('advDate').value = new Date().toISOString().split('T')[0];
}

async function loadEmployees() {
    try {
        allEmployees = await getAllEmployees();
        const select = document.getElementById('advEmployee');
        select.innerHTML = '<option value="">Select Employee...</option>' + 
            allEmployees.map(emp => `<option value="${emp.id}">${escHtml(emp.name)} (ID: ${emp.id})</option>`).join('');
    } catch (e) {
        console.warn("Could not load employees, db might not be fully populated.", e);
    }
}

async function loadAdvances() {
    allAdvances = await getAllAdvances();
    
    // Calculate stats
    let totalPending = 0;
    let totalDeducted = 0;
    
    // Sort descending by date
    allAdvances.sort((a,b) => new Date(b.date) - new Date(a.date));
    
    const filterSelect = document.getElementById('filterStatus');
    let filterStatus = filterSelect.value;
    let filtered = allAdvances.filter(adv => {
        if (adv.status === 'pending') totalPending += (adv.amount || 0);
        else totalDeducted += (adv.amount || 0);
        
        if (filterStatus === 'all') return true;
        return adv.status === filterStatus;
    });

    if (filterStatus === 'pending' && filtered.length === 0 && allAdvances.length > 0) {
        filterStatus = 'all';
        filterSelect.value = 'all';
        filtered = [...allAdvances];
    }

    document.getElementById('statPendingTotal').innerText = formatCurrency(totalPending);
    document.getElementById('statDeductedTotal').innerText = formatCurrency(totalDeducted);

    renderTable(filtered, filterStatus);
}

function renderTable(advances, filterStatus = 'all') {
    const tbody = document.getElementById('advancesTableBody');
    if (advances.length === 0) {
        const emptyMessage = filterStatus === 'pending'
            ? 'No pending advances found.'
            : filterStatus === 'deducted'
                ? 'No deducted advances found.'
                : 'No advances found.';
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-slate-500 italic">${emptyMessage}</td></tr>`;
        return;
    }

    tbody.innerHTML = advances.map(adv => {
        const emp = allEmployees.find(e => e.id == adv.employeeId);
        const empName = emp ? emp.name : `Unknown (ID: ${adv.employeeId})`;
        const isPending = adv.status === 'pending';
        
        return `
            <tr class="hover:bg-white/5 transition-colors group">
                <td class="px-6 py-4 text-slate-300">${adv.date}</td>
                <td class="px-6 py-4 font-bold text-white">${escHtml(empName)}</td>
                <td class="px-6 py-4">
                    <span class="text-xs bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-300">
                        ${adv.type === 'cash' ? '💵 Cash' : '👕 Goods'}
                    </span>
                </td>
                <td class="px-6 py-4 text-right font-mono font-bold ${isPending ? 'text-amber-400' : 'text-slate-400'}">${formatCurrency(adv.amount)}</td>
                <td class="px-6 py-4">
                    <span class="status-${adv.status}">${adv.status}</span>
                </td>
                <td class="px-6 py-4 text-slate-400 text-xs max-w-[200px] truncate" title="${escHtml(adv.reason || adv.notes)}">
                    ${escHtml(adv.reason || adv.notes || '—')}
                </td>
                <td class="px-6 py-4 text-center">
                    ${isPending ? `
                        <button onclick="markDeducted('${adv.id}')" class="bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-emerald-500/30 flex items-center justify-center gap-1 mx-auto">
                            <span class="material-symbols-outlined text-[14px]">check_circle</span> Deduct
                        </button>
                    ` : `
                        <span class="text-slate-500 text-xs italic">Settled</span>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

function openAdvanceModal() {
    document.getElementById('advEmployee').value = '';
    document.getElementById('advAmount').value = '';
    document.getElementById('advNotes').value = '';
    document.getElementById('advanceModal').classList.add('active');
}

function closeAdvanceModal() {
    document.getElementById('advanceModal').classList.remove('active');
}

async function saveAdvanceForm() {
    const empId = document.getElementById('advEmployee').value;
    const type = document.getElementById('advType').value;
    const date = document.getElementById('advDate').value;
    const amount = parseFloat(document.getElementById('advAmount').value);
    const notes = document.getElementById('advNotes').value.trim();

    if (!empId) { alert("Please select an employee."); return; }
    if (!amount || amount <= 0) { alert("Please enter a valid amount."); return; }
    if (!date) { alert("Please select a date."); return; }

    const advance = {
        employeeId: String(empId),
        type: type,
        date: date,
        amount: amount,
        reason: notes,
        status: 'pending', // default status
        createdAt: new Date().toISOString()
    };

    try {
        await saveAdvance(advance);
        closeAdvanceModal();
        loadAdvances();
    } catch (e) {
        console.error("Error saving advance:", e);
        alert("Failed to save advance.");
    }
}

async function markDeducted(id) {
    if (!confirm("Mark this advance as deducted from salary?")) return;
    
    try {
        const adv = allAdvances.find(a => String(a.id) === String(id));
        if (adv) {
            adv.status = 'deducted';
            adv.deductedAt = new Date().toISOString();
            await saveAdvance(adv);
            loadAdvances();
        }
    } catch (e) {
        console.error("Error updating advance:", e);
        alert("Failed to update status.");
    }
}

// Start
init();

/* placeholder aria-label */
