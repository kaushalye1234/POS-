// =============================================
// Fashion Shaa POS - Employee, Attendance, Payroll & Access Management
// =============================================

let isEditing = false;
let editingId = null;
let accessEditingUserId = null;
let currentAuthUser = null;
let selectedAnalyticsPeriod = 'today';

let employeeCache = [];
let accessUsers = [];
let attendanceCache = [];
let advancesCache = [];

function getTodayBusinessDateString() {
    if (window.POS_API?.formatBusinessDate) {
        return window.POS_API.formatBusinessDate(new Date());
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    currentAuthUser = window.POS_API?.getAuthUser?.() || null;

    initWorkforceDefaults();
    applyPagePermissions();
    setupEventListeners();
    setupAnalyticsPeriodControls();

    if (!canManageEmployeeDirectory()) {
        renderRestrictedState();
        return;
    }

    try {
        const dbPromise = initDatabase();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database initialization timed out')), 5000)
        );
        await Promise.race([dbPromise, timeoutPromise]);

        await reloadAllData();
        await refreshAccessPanel();
        await refreshEmployeeAnalytics();
    } catch (error) {
        console.error('Initialization error:', error);
        showToast(error.message || 'Failed to initialize employee management.', 'error');
        renderLoadFailure(error.message || 'Failed to load employee management.');
    }
});

function initWorkforceDefaults() {
    const todayStr = getTodayBusinessDateString();
    const monthStr = todayStr.slice(0, 7);

    const attendanceDateInput = document.getElementById('attendanceDateInput');
    const payrollMonthInput = document.getElementById('payrollMonthInput');
    const quickAdvanceDate = document.getElementById('quickAdvanceDate');
    const workingDaysInput = document.getElementById('newEmpWorkingDays');

    if (attendanceDateInput) attendanceDateInput.value = todayStr;
    if (payrollMonthInput) payrollMonthInput.value = monthStr;
    if (quickAdvanceDate) quickAdvanceDate.value = todayStr;
    if (workingDaysInput) workingDaysInput.value = '26';
}

function canManageEmployeeDirectory() {
    return ['admin', 'manager'].includes(currentAuthUser?.role);
}

function canManageAttendanceAndPayroll() {
    return ['admin', 'manager'].includes(currentAuthUser?.role);
}

function canCreateStaffAccess() {
    return ['admin', 'manager'].includes(currentAuthUser?.role);
}

function canViewStaffAccess() {
    return currentAuthUser?.role === 'admin';
}

function setupEventListeners() {
    document.getElementById('addEmployeeBtn')?.addEventListener('click', handleAddEmployee);
    document.getElementById('updateEmployeeBtn')?.addEventListener('click', handleUpdateEmployee);
    document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);

    document.getElementById('createAccessBtn')?.addEventListener('click', handleCreateAccess);
    document.getElementById('updateAccessBtn')?.addEventListener('click', handleUpdateAccess);
    document.getElementById('cancelAccessEditBtn')?.addEventListener('click', cancelAccessEdit);

    document.getElementById('attendanceDateInput')?.addEventListener('change', renderWorkforceOperations);
    document.getElementById('payrollMonthInput')?.addEventListener('change', renderWorkforceOperations);
    document.getElementById('recordAdvanceBtn')?.addEventListener('click', handleRecordAdvance);
}

function setupAnalyticsPeriodControls() {
    document.querySelectorAll('.employee-analytics-period-btn').forEach((button) => {
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
            setAnalyticsPeriod(button.dataset.period || 'today');
        });
    });
    syncAnalyticsPeriodButtons();
}

function setAnalyticsPeriod(period) {
    selectedAnalyticsPeriod = period || 'today';
    syncAnalyticsPeriodButtons();
    refreshEmployeeAnalytics();
}

function syncAnalyticsPeriodButtons() {
    document.querySelectorAll('.employee-analytics-period-btn').forEach((button) => {
        const isActive = button.dataset.period === selectedAnalyticsPeriod;
        button.classList.toggle('bg-primary', isActive);
        button.classList.toggle('text-white', isActive);
        button.classList.toggle('shadow-sm', isActive);
        button.classList.toggle('text-slate-400', !isActive);
        button.classList.toggle('hover:text-white', !isActive);
    });
}

function applyPagePermissions() {
    const roleHint = document.getElementById('accessRoleHint');
    const permissionMessage = document.getElementById('accessPermissionMessage');
    const accessRoleField = document.getElementById('accessRole');
    const accessStatusField = document.getElementById('accessStatus');

    if (roleHint) {
        roleHint.textContent = currentAuthUser
            ? `Signed in as ${currentAuthUser.username} (${currentAuthUser.role})`
            : 'Not signed in';
    }

    const directoryLocked = !canManageEmployeeDirectory();
    document.querySelectorAll(
        '#newEmpId, #newEmpName, #newEmpPhone, #newEmpRole, #newEmpSalary, #newEmpWorkingDays'
    ).forEach((input) => {
        input.disabled = directoryLocked;
    });
    ['addEmployeeBtn', 'updateEmployeeBtn', 'cancelEditBtn'].forEach((id) => {
        const button = document.getElementById(id);
        if (button) button.disabled = directoryLocked;
    });

    const opsLocked = !canManageAttendanceAndPayroll();
    document.querySelectorAll(
        '#attendanceDateInput, #payrollMonthInput, #quickAdvanceEmployee, #quickAdvanceType, #quickAdvanceDate, #quickAdvanceAmount, #quickAdvanceReason'
    ).forEach((input) => {
        input.disabled = opsLocked;
    });
    const advanceButton = document.getElementById('recordAdvanceBtn');
    if (advanceButton) advanceButton.disabled = opsLocked;

    const accessLocked = !canCreateStaffAccess();
    document.querySelectorAll(
        '#accessEmployeeId, #accessRole, #accessUsername, #accessStatus, #accessPassword, #accessPin'
    ).forEach((input) => {
        input.disabled = accessLocked;
    });
    ['createAccessBtn', 'updateAccessBtn', 'cancelAccessEditBtn'].forEach((id) => {
        const button = document.getElementById(id);
        if (button) button.disabled = accessLocked;
    });

    if (permissionMessage) {
        permissionMessage.classList.add('hidden');

        if (!currentAuthUser) {
            permissionMessage.textContent = 'You need to sign in before you can manage workers and permissions.';
            permissionMessage.classList.remove('hidden');
        } else if (!canCreateStaffAccess()) {
            permissionMessage.textContent = 'Only admins and managers can add workers or assign login permissions.';
            permissionMessage.classList.remove('hidden');
        } else if (!canViewStaffAccess()) {
            permissionMessage.textContent = 'Managers can create new staff logins here, but only admins can review and edit all existing system accounts.';
            permissionMessage.classList.remove('hidden');
        }
    }

    if (currentAuthUser?.role === 'manager' && accessRoleField) {
        accessRoleField.value = 'cashier';
        accessRoleField.disabled = true;
    } else if (accessRoleField && !accessLocked) {
        accessRoleField.disabled = false;
    }

    if (accessStatusField) {
        accessStatusField.disabled = !canViewStaffAccess() || accessLocked;
        accessStatusField.value = 'true';
    }
}

function renderRestrictedState() {
    const message = 'This page is available to admins and managers only.';

    const analytics = document.getElementById('employeeAnalytics');
    const employeeGrid = document.getElementById('employeeGridBody');
    const attendanceRoster = document.getElementById('attendanceRoster');
    const recentAdvances = document.getElementById('recentAdvancesList');
    const salaryTableBody = document.getElementById('salaryTableBody');
    const accessUsersList = document.getElementById('accessUsersList');

    if (analytics) {
        analytics.innerHTML = `<div class="glass-card p-6 rounded-2xl text-amber-300 border border-amber-500/20">${escapeHtml(message)}</div>`;
    }
    if (employeeGrid) {
        employeeGrid.innerHTML = `<div class="glass-card p-8 rounded-2xl text-center text-amber-300 border border-amber-500/20 col-span-3">${escapeHtml(message)}</div>`;
    }
    if (attendanceRoster) {
        attendanceRoster.innerHTML = `<div class="empty-mini">${escapeHtml(message)}</div>`;
    }
    if (recentAdvances) {
        recentAdvances.innerHTML = `<div class="empty-mini">${escapeHtml(message)}</div>`;
    }
    if (salaryTableBody) {
        salaryTableBody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-amber-300">${escapeHtml(message)}</td></tr>`;
    }
    if (accessUsersList) {
        accessUsersList.innerHTML = `<div class="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-300">${escapeHtml(message)}</div>`;
    }
}

function renderLoadFailure(message) {
    const safeMessage = escapeHtml(message || 'Failed to load workforce data.');
    const analytics = document.getElementById('employeeAnalytics');
    const employeeGrid = document.getElementById('employeeGridBody');
    const attendanceRoster = document.getElementById('attendanceRoster');
    const recentAdvances = document.getElementById('recentAdvancesList');
    const salaryTableBody = document.getElementById('salaryTableBody');

    if (analytics) {
        analytics.innerHTML = `<div class="glass-card p-6 rounded-2xl text-red-300 border border-red-500/20">${safeMessage}</div>`;
    }
    if (employeeGrid) {
        employeeGrid.innerHTML = `<div class="glass-card p-8 rounded-2xl text-center text-red-300 border border-red-500/20 col-span-3">${safeMessage}</div>`;
    }
    if (attendanceRoster) {
        attendanceRoster.innerHTML = `<div class="empty-mini">${safeMessage}</div>`;
    }
    if (recentAdvances) {
        recentAdvances.innerHTML = `<div class="empty-mini">${safeMessage}</div>`;
    }
    if (salaryTableBody) {
        salaryTableBody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-red-300">${safeMessage}</td></tr>`;
    }
}

async function reloadAllData() {
    employeeCache = await getAllEmployees();
    attendanceCache = await getAllAttendance();
    advancesCache = await getAllAdvances();

    employeeCache.sort((a, b) => employeeSortValue(a) - employeeSortValue(b));
    advancesCache.sort((a, b) => sortDescendingByDate(a.date, b.date));

    renderEmployeeOptions();
    renderAdvanceEmployeeOptions();
    await renderEmployeeCards();
    renderWorkforceOperations();
    setSuggestedEmployeeId();
}

function renderEmployeeOptions() {
    const accessSelect = document.getElementById('accessEmployeeId');
    if (accessSelect) {
        const previousValue = accessSelect.value;
        accessSelect.innerHTML = '<option value="">Not linked</option>' + employeeCache.map((employee) => (
            `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.id)} - ${escapeHtml(employee.name)}</option>`
        )).join('');
        if ([...accessSelect.options].some((option) => option.value === previousValue)) {
            accessSelect.value = previousValue;
        }
    }
}

function renderAdvanceEmployeeOptions() {
    const select = document.getElementById('quickAdvanceEmployee');
    if (!select) return;

    const previousValue = select.value;
    select.innerHTML = '<option value="">Select Employee...</option>' + employeeCache.map((employee) => (
        `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)} (ID: ${escapeHtml(employee.id)})</option>`
    )).join('');

    if ([...select.options].some((option) => option.value === previousValue)) {
        select.value = previousValue;
    }
}

async function renderEmployeeCards() {
    const container = document.getElementById('employeeGridBody');
    if (!container) return;

    if (!employeeCache.length) {
        container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-icon">👥</div><p>No employees found.</p><span class="hint">Add your first worker above.</span></div>';
        return;
    }

    const selectedDate = getSelectedAttendanceDate();
    const dayStatusMap = getAttendanceStatusMapForDate(selectedDate);

    const employeesWithStats = await Promise.all(employeeCache.map(async (employee) => {
        const statsToday = await getEmployeeStats(employee.id, 'today');
        const statsWeek = await getEmployeeStats(employee.id, 'week');
        const statsYear = await getEmployeeStats(employee.id, 'year');

        return {
            ...employee,
            salesToday: statsToday.salesCount,
            salesWeek: statsWeek.salesCount,
            salesYear: statsYear.salesCount,
            todayStatus: dayStatusMap.get(employee.id) || 'unmarked',
            pendingAdvanceTotal: getPendingAdvanceTotal(employee.id)
        };
    }));

    container.innerHTML = employeesWithStats.map((employee) => `
        <div class="employee-card">
            <div class="employee-card-header">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(employee.name)}&background=1e293b&color=dc2626&size=128&bold=true" alt="${escapeHtml(employee.name)}" class="employee-avatar" />
                <div class="employee-info">
                    <h3>${escapeHtml(employee.name)}</h3>
                    <div class="flex flex-wrap items-center gap-2 mt-1">
                        <span class="role-badge ${roleBadgeClass(employee.role)}" style="text-transform: capitalize; font-size: 0.8rem; padding: 2px 8px; border-radius: 4px; display: inline-block;">${escapeHtml(employee.role || 'cashier')}</span>
                        <span class="attendance-chip ${attendanceClass(employee.todayStatus)}">${attendanceLabel(employee.todayStatus)}</span>
                    </div>
                    <div class="employee-id mt-2">${escapeHtml(employee.id)} • ${escapeHtml(employee.phone || 'No phone')}</div>
                    <div class="text-xs text-slate-400 mt-2">Salary: ${formatCurrency(employee.baseSalary)} • Pending Advances: ${formatCurrency(employee.pendingAdvanceTotal)}</div>
                </div>
            </div>
            <div class="employee-stats">
                <div class="stat-item">
                    <span class="stat-value">${employee.salesToday || 0}</span>
                    <span class="stat-label">Today</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${employee.salesWeek || 0}</span>
                    <span class="stat-label">Week</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${employee.salesYear || 0}</span>
                    <span class="stat-label">Year</span>
                </div>
            </div>
            <div class="employee-actions">
                <button class="btn-action btn-edit" onclick="startEdit('${escapeHtml(employee.id)}')">✏️ Edit</button>
                <button class="btn-action btn-delete" onclick="handleDelete('${escapeHtml(employee.id)}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

function renderWorkforceOperations() {
    renderWorkforceSummary();
    renderAttendanceRoster();
    renderRecentAdvances();
    renderPayrollTable();
}

function renderWorkforceSummary() {
    const container = document.getElementById('workforceSummary');
    if (!container) return;

    const selectedDate = getSelectedAttendanceDate();
    const statusMap = getAttendanceStatusMapForDate(selectedDate);
    const payrollRows = buildPayrollRows();

    const availableToday = employeeCache.filter((employee) => {
        const status = statusMap.get(employee.id);
        return status === 'present' || status === 'half-day';
    }).length;
    const absentToday = employeeCache.filter((employee) => statusMap.get(employee.id) === 'absent').length;
    const unmarkedToday = employeeCache.filter((employee) => !statusMap.get(employee.id)).length;
    const pendingAdvances = advancesCache
        .filter((advance) => advance.status === 'pending')
        .reduce((sum, advance) => sum + Number(advance.amount || 0), 0);
    const payrollTotal = payrollRows.reduce((sum, row) => sum + row.netPayable, 0);

    container.innerHTML = `
        <div class="ops-stat-card">
            <div class="ops-label">Available Workers</div>
            <div class="ops-stat-value">${availableToday}</div>
            <div class="mt-2 text-sm text-slate-400">${employeeCache.length} total workers for ${formatDateLabel(selectedDate)}</div>
        </div>
        <div class="ops-stat-card">
            <div class="ops-label">Absent Today</div>
            <div class="ops-stat-value">${absentToday}</div>
            <div class="mt-2 text-sm text-slate-400">${unmarkedToday} still unmarked</div>
        </div>
        <div class="ops-stat-card">
            <div class="ops-label">Pending Advances</div>
            <div class="ops-stat-value">${formatCurrency(pendingAdvances)}</div>
            <div class="mt-2 text-sm text-slate-400">${advancesCache.filter((advance) => advance.status === 'pending').length} unsettled records</div>
        </div>
        <div class="ops-stat-card">
            <div class="ops-label">Payroll Preview</div>
            <div class="ops-stat-value">${formatCurrency(payrollTotal)}</div>
            <div class="mt-2 text-sm text-slate-400">Net payout for ${getSelectedPayrollMonth()}</div>
        </div>
    `;
}

function renderAttendanceRoster() {
    const container = document.getElementById('attendanceRoster');
    if (!container) return;

    if (!employeeCache.length) {
        container.innerHTML = '<div class="empty-mini">Add workers first so attendance can be marked.</div>';
        return;
    }

    const selectedDate = getSelectedAttendanceDate();
    const statusMap = getAttendanceStatusMapForDate(selectedDate);

    container.innerHTML = employeeCache.map((employee) => {
        const status = statusMap.get(employee.id) || 'unmarked';
        return `
            <div class="attendance-row">
                <div class="min-w-0">
                    <div class="text-sm font-bold text-white truncate">${escapeHtml(employee.name)}</div>
                    <div class="mt-1 text-xs text-slate-400">${escapeHtml(employee.id)} • ${escapeHtml(employee.role)} • Salary ${formatCurrency(employee.baseSalary)}</div>
                </div>
                <div class="flex justify-center sm:justify-start">
                    <span class="attendance-chip ${attendanceClass(status)}">${attendanceLabel(status)}</span>
                </div>
                <div class="attendance-actions">
                    <button class="attendance-btn present" onclick="markAttendanceStatus('${escapeHtml(employee.id)}', 'present')">Present</button>
                    <button class="attendance-btn half-day" onclick="markAttendanceStatus('${escapeHtml(employee.id)}', 'half-day')">Half Day</button>
                    <button class="attendance-btn absent" onclick="markAttendanceStatus('${escapeHtml(employee.id)}', 'absent')">Absent</button>
                    <button class="attendance-btn leave" onclick="markAttendanceStatus('${escapeHtml(employee.id)}', 'leave')">Leave</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecentAdvances() {
    const container = document.getElementById('recentAdvancesList');
    if (!container) return;

    if (!advancesCache.length) {
        container.innerHTML = '<div class="empty-mini">No advances recorded yet.</div>';
        return;
    }

    const latestAdvances = [...advancesCache]
        .sort((a, b) => sortDescendingByDate(a.date, b.date))
        .slice(0, 5);

    container.innerHTML = latestAdvances.map((advance) => {
        const employee = findEmployeeById(advance.employeeId);
        const employeeLabel = employee ? `${employee.name} (${employee.id})` : advance.employeeId;
        const isPending = advance.status === 'pending';

        return `
            <div class="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-sm font-bold text-white truncate">${escapeHtml(employeeLabel)}</div>
                        <div class="mt-1 text-xs text-slate-400">${escapeHtml(advance.type)} • ${escapeHtml(advance.date || 'No date')}</div>
                        <div class="mt-2 text-xs text-slate-500">${escapeHtml(advance.reason || 'No reason provided')}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-black text-amber-400">${formatCurrency(advance.amount)}</div>
                        <div class="mt-2">
                            <span class="attendance-chip ${isPending ? 'status-half-day' : 'status-present'}">${isPending ? 'Pending' : 'Deducted'}</span>
                        </div>
                    </div>
                </div>
                ${isPending ? `
                    <button class="mt-3 w-full rounded-lg bg-emerald-500/12 border border-emerald-500/25 px-3 py-2 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/22" onclick="markAdvanceDeducted('${escapeHtml(advance.id)}')">
                        Mark as deducted from salary
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderPayrollTable() {
    const tbody = document.getElementById('salaryTableBody');
    const summary = document.getElementById('payrollSummary');
    if (!tbody) return;

    const rows = buildPayrollRows();

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500 italic">Add workers to start salary calculations.</td></tr>';
        if (summary) summary.textContent = 'No payroll data yet.';
        return;
    }

    const totals = rows.reduce((acc, row) => {
        acc.gross += row.grossEarned;
        acc.advances += row.pendingAdvances;
        acc.net += row.netPayable;
        return acc;
    }, { gross: 0, advances: 0, net: 0 });

    tbody.innerHTML = rows.map((row) => `
        <tr>
            <td class="pr-4">
                <div class="font-bold text-white">${escapeHtml(row.employee.name)}</div>
                <div class="text-xs text-slate-400 mt-1">${escapeHtml(row.employee.id)} • ${row.presentDays} present • ${row.halfDays} half days</div>
            </td>
            <td class="text-right font-semibold text-white">${formatCurrency(row.baseSalary)}</td>
            <td class="text-right text-slate-300">${row.payableDays.toFixed(1)} / ${row.workingDaysPerMonth}</td>
            <td class="text-right font-semibold text-white">${formatCurrency(row.grossEarned)}</td>
            <td class="text-right text-amber-400">${formatCurrency(row.pendingAdvances)}</td>
            <td class="text-right font-black ${row.netPayable > 0 ? 'text-emerald-400' : 'text-slate-400'}">${formatCurrency(row.netPayable)}</td>
        </tr>
    `).join('');

    if (summary) {
        summary.textContent = `Gross ${formatCurrency(totals.gross)} • Pending advances ${formatCurrency(totals.advances)} • Net payout ${formatCurrency(totals.net)}`;
    }
}

function buildPayrollRows() {
    const selectedMonth = getSelectedPayrollMonth();
    return employeeCache.map((employee) => calculatePayrollForEmployee(employee, selectedMonth));
}

function calculatePayrollForEmployee(employee, month) {
    const monthRecords = attendanceCache.filter((record) => (
        record.employeeId === employee.id && record.date.startsWith(`${month}-`)
    ));

    let presentDays = 0;
    let halfDays = 0;
    let leaveDays = 0;

    monthRecords.forEach((record) => {
        if (record.status === 'present') presentDays += 1;
        if (record.status === 'half-day') halfDays += 1;
        if (record.status === 'leave') leaveDays += 1;
    });

    const payableDays = presentDays + leaveDays + (halfDays * 0.5);
    const baseSalary = Number(employee.baseSalary || 0);
    const workingDaysPerMonth = Math.max(1, Number(employee.workingDaysPerMonth || 26));
    const grossEarned = baseSalary > 0
        ? (baseSalary / workingDaysPerMonth) * Math.min(payableDays, workingDaysPerMonth)
        : 0;

    const pendingAdvances = advancesCache
        .filter((advance) => advance.employeeId === employee.id && advance.status === 'pending')
        .reduce((sum, advance) => sum + Number(advance.amount || 0), 0);

    return {
        employee,
        baseSalary,
        workingDaysPerMonth,
        presentDays,
        halfDays,
        leaveDays,
        payableDays,
        grossEarned,
        pendingAdvances,
        netPayable: Math.max(grossEarned - pendingAdvances, 0)
    };
}

function getAttendanceStatusMapForDate(date) {
    const map = new Map();
    attendanceCache
        .filter((record) => record.date === date)
        .forEach((record) => map.set(record.employeeId, record.status));
    return map;
}

function getPendingAdvanceTotal(employeeId) {
    return advancesCache
        .filter((advance) => advance.employeeId === employeeId && advance.status === 'pending')
        .reduce((sum, advance) => sum + Number(advance.amount || 0), 0);
}

window.markAttendanceStatus = async function(employeeId, status) {
    if (!canManageAttendanceAndPayroll()) {
        showToast('You do not have permission to mark attendance.', 'error');
        return;
    }

    const employee = findEmployeeById(employeeId);
    if (!employee) {
        showToast('Worker not found.', 'error');
        return;
    }

    try {
        await saveAttendanceRecord({
            employeeId: employee.id,
            employeeName: employee.name,
            date: getSelectedAttendanceDate(),
            status,
            markedBy: currentAuthUser?.username || 'system'
        });
        attendanceCache = await getAllAttendance();
        renderWorkforceOperations();
        await renderEmployeeCards();
        showToast(`${employee.name} marked as ${attendanceLabel(status)}.`, 'success');
    } catch (error) {
        console.error('Failed to save attendance:', error);
        showToast(error.message || 'Failed to mark attendance.', 'error');
    }
};

async function handleRecordAdvance() {
    if (!canManageAttendanceAndPayroll()) {
        showToast('You do not have permission to record advances.', 'error');
        return;
    }

    const employeeId = document.getElementById('quickAdvanceEmployee').value;
    const type = document.getElementById('quickAdvanceType').value;
    const date = document.getElementById('quickAdvanceDate').value;
    const amount = parseFloat(document.getElementById('quickAdvanceAmount').value);
    const reason = document.getElementById('quickAdvanceReason').value.trim();

    if (!employeeId) {
        showToast('Please select a worker for the advance.', 'error');
        return;
    }

    if (!amount || amount <= 0) {
        showToast('Please enter a valid advance amount.', 'error');
        return;
    }

    try {
        await saveAdvance({
            employeeId,
            type,
            date: date || getSelectedAttendanceDate(),
            amount,
            reason,
            status: 'pending',
            createdAt: new Date().toISOString()
        });
        advancesCache = await getAllAdvances();
        renderWorkforceOperations();
        clearAdvanceForm();
        showToast('Advance recorded successfully.', 'success');
    } catch (error) {
        console.error('Failed to record advance:', error);
        showToast(error.message || 'Failed to record advance.', 'error');
    }
}

window.markAdvanceDeducted = async function(advanceId) {
    const advance = advancesCache.find((item) => String(item.id) === String(advanceId));
    if (!advance) {
        showToast('Advance record not found.', 'error');
        return;
    }

    try {
        await saveAdvance({
            ...advance,
            status: 'deducted',
            deductedAt: new Date().toISOString()
        });
        advancesCache = await getAllAdvances();
        renderWorkforceOperations();
        showToast('Advance marked as deducted.', 'success');
    } catch (error) {
        console.error('Failed to update advance:', error);
        showToast(error.message || 'Failed to update advance.', 'error');
    }
};

async function handleAddEmployee() {
    const payload = readEmployeeForm();
    if (!payload) return;

    try {
        const exists = await getEmployee(payload.id);
        if (exists) {
            const suggestedId = getNextEmployeeNumericId();
            const currentId = payload.id.replace('E', '');
            document.getElementById('newEmpId').value = String(suggestedId);
            showToast(
                suggestedId.toString() !== currentId
                    ? `Employee ID ${currentId} already exists. Try worker ID ${suggestedId} or edit the existing worker.`
                    : `Employee ID ${currentId} already exists. Edit the existing worker or choose a different ID.`,
                'error'
            );
            document.getElementById('newEmpId').focus();
            return;
        }

        await saveEmployee(payload.id, payload.name, payload.phone, payload.role, {
            baseSalary: payload.baseSalary,
            workingDaysPerMonth: payload.workingDaysPerMonth
        });

        showToast(`Employee ${payload.id} added successfully.`, 'success');
        clearForm();
        await reloadAllData();
        await refreshAccessPanel();
        await refreshEmployeeAnalytics();
        document.getElementById('newEmpId').focus();
    } catch (error) {
        console.error('Failed to add employee:', error);
        showToast(error.message || 'Failed to add employee.', 'error');
    }
}

window.startEdit = async function(id) {
    const employee = await getEmployee(id);
    if (!employee) return;

    document.getElementById('newEmpId').value = employee.id.replace('E', '');
    document.getElementById('newEmpName').value = employee.name || '';
    document.getElementById('newEmpPhone').value = employee.phone || '';
    document.getElementById('newEmpRole').value = employee.role || 'cashier';
    document.getElementById('newEmpSalary').value = employee.baseSalary || 0;
    document.getElementById('newEmpWorkingDays').value = employee.workingDaysPerMonth || 26;

    document.getElementById('addEmployeeBtn').style.display = 'none';
    document.getElementById('updateEmployeeBtn').style.display = 'inline-block';
    document.getElementById('cancelEditBtn').style.display = 'inline-block';

    isEditing = true;
    editingId = employee.id;
    document.getElementById('newEmpName').focus();
};

async function handleUpdateEmployee() {
    if (!isEditing || !editingId) return;

    const payload = readEmployeeForm();
    if (!payload) return;

    try {
        if (payload.id !== editingId) {
            const exists = await getEmployee(payload.id);
            if (exists) {
                showToast(`Employee ID ${payload.id.replace('E', '')} already exists.`, 'error');
                return;
            }

            await saveEmployee(payload.id, payload.name, payload.phone, payload.role, {
                baseSalary: payload.baseSalary,
                workingDaysPerMonth: payload.workingDaysPerMonth
            });
            await deleteEmployeeFromDB(editingId);
        } else {
            await updateEmployeeRecord(editingId, {
                name: payload.name,
                phone: payload.phone,
                role: payload.role,
                baseSalary: payload.baseSalary,
                workingDaysPerMonth: payload.workingDaysPerMonth
            });
        }

        showToast('Employee updated successfully.', 'success');
        cancelEdit();
        await reloadAllData();
        await refreshAccessPanel();
        await refreshEmployeeAnalytics();
        document.getElementById('newEmpId').focus();
    } catch (error) {
        console.error('Failed to update employee:', error);
        showToast(error.message || 'Failed to update employee.', 'error');
    }
}

function cancelEdit() {
    isEditing = false;
    editingId = null;
    clearForm();
    document.getElementById('addEmployeeBtn').style.display = 'inline-block';
    document.getElementById('updateEmployeeBtn').style.display = 'none';
    document.getElementById('cancelEditBtn').style.display = 'none';
}

window.handleDelete = async function(id) {
    const employee = await getEmployee(id);
    if (!employee) {
        showToast(`Employee not found (${id}).`, 'error');
        return;
    }

    if (!confirm(`Delete employee ${employee.name} (${employee.id})?`)) {
        return;
    }

    try {
        await deleteEmployeeFromDB(employee.id);
        showToast(`Employee ${employee.name} deleted successfully.`, 'success');
        await reloadAllData();
        await refreshAccessPanel();
        await refreshEmployeeAnalytics();
    } catch (error) {
        console.error('Failed to delete employee:', error);
        showToast(error.message || 'Failed to delete employee.', 'error');
    }
};

async function refreshAccessPanel() {
    if (!canCreateStaffAccess()) return;

    if (!canViewStaffAccess()) {
        renderAccessUsersMessage('Managers can create new logins here, but only admins can review and edit all existing system accounts.');
        return;
    }

    try {
        accessUsers = await getSystemUsers();
        accessUsers.sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
        renderAccessUsers();
    } catch (error) {
        console.error('Failed to load access accounts:', error);
        renderAccessUsersMessage(error.message || 'Failed to load staff accounts.', true);
    }
}

function renderAccessUsers() {
    const list = document.getElementById('accessUsersList');
    if (!list) return;

    if (!accessUsers.length) {
        list.innerHTML = '<div class="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-4 text-sm text-slate-400">No login accounts yet. Create the first staff login from the form on the left.</div>';
        return;
    }

    list.innerHTML = accessUsers.map((user) => {
        const userId = user._id || user.id;
        const employee = findEmployeeById(user.employeeId);
        const employeeLabel = employee
            ? `${employee.id} - ${employee.name}`
            : (user.employeeId ? user.employeeId : 'Not linked');
        const statusLabel = user.isActive === false ? 'Deactivated' : 'Active';
        const toggleLabel = user.isActive === false ? 'Activate' : 'Deactivate';

        return `
            <div class="rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-3">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-base font-bold text-white truncate">${escapeHtml(user.username || 'Unknown user')}</div>
                        <div class="text-xs text-slate-400 mt-1">Employee: ${escapeHtml(employeeLabel)}</div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 justify-end">
                        <span class="role-badge ${roleBadgeClass(user.role)}" style="text-transform: capitalize;">${escapeHtml(user.role || 'cashier')}</span>
                        <span class="role-badge ${user.isActive === false ? 'status-inactive' : 'status-active'}">${statusLabel}</span>
                    </div>
                </div>
                <div class="text-xs text-slate-500">Last login: ${formatLastLogin(user.lastLogin)}</div>
                <div class="flex flex-wrap gap-2">
                    <button class="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors" onclick="startAccessEdit('${escapeHtml(userId)}')">Edit Access</button>
                    <button class="px-3 py-2 rounded-lg ${user.isActive === false ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'} text-xs font-bold text-white transition-colors" onclick="toggleAccessStatus('${escapeHtml(userId)}', ${user.isActive === false ? 'true' : 'false'})">${toggleLabel}</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderAccessUsersMessage(message, isError = false) {
    const list = document.getElementById('accessUsersList');
    if (!list) return;

    list.innerHTML = `
        <div class="rounded-xl border ${isError ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-slate-700 bg-slate-900/40 text-slate-400'} px-4 py-4 text-sm">
            ${escapeHtml(message)}
        </div>
    `;
}

async function handleCreateAccess() {
    if (!canCreateStaffAccess()) {
        showToast('You do not have permission to create staff logins.', 'error');
        return;
    }

    const username = document.getElementById('accessUsername').value.trim();
    const password = document.getElementById('accessPassword').value;
    const employeeId = document.getElementById('accessEmployeeId').value || null;
    const role = document.getElementById('accessRole').value;
    const pin = document.getElementById('accessPin').value.trim();
    const shouldBeActive = document.getElementById('accessStatus').value === 'true';

    if (username.length < 3) {
        showToast('Username must be at least 3 characters.', 'error');
        document.getElementById('accessUsername').focus();
        return;
    }
    if (password.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        document.getElementById('accessPassword').focus();
        return;
    }
    if (pin && pin.length < 4) {
        showToast('PIN must be at least 4 digits.', 'error');
        document.getElementById('accessPin').focus();
        return;
    }

    try {
        const created = await createSystemUserAccount({ username, password, role, employeeId, pin: pin || null });
        const createdUserId = created?.user?._id || created?.user?.id;

        if (!shouldBeActive && createdUserId && canViewStaffAccess()) {
            await updateSystemUserAccount(createdUserId, { isActive: false });
        }

        showToast(`Login created for ${username}.`, 'success');
        clearAccessForm();
        await refreshAccessPanel();
    } catch (error) {
        console.error('Failed to create access:', error);
        showToast(error.message || 'Failed to create staff login.', 'error');
    }
}

window.startAccessEdit = function(userId) {
    if (!canViewStaffAccess()) return;

    const user = accessUsers.find((entry) => String(entry._id || entry.id) === String(userId));
    if (!user) return;

    accessEditingUserId = user._id || user.id;

    document.getElementById('accessFormTitle').textContent = `Edit Access - ${user.username}`;
    document.getElementById('accessEmployeeId').value = user.employeeId || '';
    document.getElementById('accessRole').value = user.role || 'cashier';
    document.getElementById('accessUsername').value = user.username || '';
    document.getElementById('accessUsername').disabled = true;
    document.getElementById('accessStatus').value = user.isActive === false ? 'false' : 'true';
    document.getElementById('accessPassword').value = '';
    document.getElementById('accessPin').value = '';

    document.getElementById('createAccessBtn').classList.add('hidden');
    document.getElementById('updateAccessBtn').classList.remove('hidden');
    document.getElementById('cancelAccessEditBtn').classList.remove('hidden');
}

async function handleUpdateAccess() {
    if (!canViewStaffAccess() || !accessEditingUserId) {
        showToast('Only admins can update staff access.', 'error');
        return;
    }

    const password = document.getElementById('accessPassword').value;
    const pin = document.getElementById('accessPin').value.trim();
    const role = document.getElementById('accessRole').value;
    const employeeId = document.getElementById('accessEmployeeId').value || null;
    const isActive = document.getElementById('accessStatus').value === 'true';

    if (password && password.length < 6) {
        showToast('New password must be at least 6 characters.', 'error');
        document.getElementById('accessPassword').focus();
        return;
    }
    if (pin && pin.length < 4) {
        showToast('PIN must be at least 4 digits.', 'error');
        document.getElementById('accessPin').focus();
        return;
    }

    const updates = { role, employeeId, isActive };
    if (password) updates.password = password;
    if (pin) updates.pin = pin;

    try {
        await updateSystemUserAccount(accessEditingUserId, updates);
        showToast('Login access updated successfully.', 'success');
        cancelAccessEdit();
        await refreshAccessPanel();
    } catch (error) {
        console.error('Failed to update access:', error);
        showToast(error.message || 'Failed to update login access.', 'error');
    }
}

window.toggleAccessStatus = async function(userId, nextActive) {
    if (!canViewStaffAccess()) {
        showToast('Only admins can change account status.', 'error');
        return;
    }

    try {
        await updateSystemUserAccount(userId, { isActive: Boolean(nextActive) });
        showToast(`Account ${nextActive ? 'activated' : 'deactivated'}.`, 'success');
        await refreshAccessPanel();
    } catch (error) {
        console.error('Failed to update account status:', error);
        showToast(error.message || 'Failed to update account status.', 'error');
    }
};

function cancelAccessEdit() {
    accessEditingUserId = null;
    clearAccessForm();
}

async function refreshEmployeeAnalytics() {
    if (typeof renderEmployeeAnalytics !== 'function') return;

    try {
        await renderEmployeeAnalytics('employeeAnalytics', selectedAnalyticsPeriod);
    } catch (error) {
        console.error('Employee analytics failed:', error);
        const analytics = document.getElementById('employeeAnalytics');
        if (analytics) {
            analytics.innerHTML = `
                <div class="glass-card p-6 rounded-2xl border border-amber-500/20 text-amber-300">
                    Employee analytics is temporarily unavailable, but workforce management is still ready below.
                </div>
            `;
        }
    }
}

function readEmployeeForm() {
    const rawNumericId = parseInt(document.getElementById('newEmpId').value, 10);
    const name = document.getElementById('newEmpName').value.trim();
    const phone = document.getElementById('newEmpPhone').value.trim();
    const role = document.getElementById('newEmpRole').value;
    const baseSalary = parseFloat(document.getElementById('newEmpSalary').value || '0');
    const workingDaysPerMonth = parseInt(document.getElementById('newEmpWorkingDays').value || '26', 10);

    if (!rawNumericId || rawNumericId < 1) {
        showToast('Please enter a valid numeric worker ID.', 'error');
        document.getElementById('newEmpId').focus();
        return null;
    }
    if (!name) {
        showToast('Please enter employee name.', 'error');
        document.getElementById('newEmpName').focus();
        return null;
    }
    if (!phone) {
        showToast('Please enter employee phone number.', 'error');
        document.getElementById('newEmpPhone').focus();
        return null;
    }
    if (Number.isNaN(baseSalary) || baseSalary < 0) {
        showToast('Please enter a valid monthly salary.', 'error');
        document.getElementById('newEmpSalary').focus();
        return null;
    }
    if (!workingDaysPerMonth || workingDaysPerMonth < 1) {
        showToast('Working days per month must be at least 1.', 'error');
        document.getElementById('newEmpWorkingDays').focus();
        return null;
    }

    return {
        id: 'E' + rawNumericId,
        name,
        phone,
        role,
        baseSalary,
        workingDaysPerMonth
    };
}

function clearForm() {
    document.getElementById('newEmpId').value = '';
    document.getElementById('newEmpName').value = '';
    document.getElementById('newEmpPhone').value = '';
    document.getElementById('newEmpRole').value = 'cashier';
    document.getElementById('newEmpSalary').value = '';
    document.getElementById('newEmpWorkingDays').value = '26';
    setSuggestedEmployeeId(true);
}

function clearAdvanceForm() {
    document.getElementById('quickAdvanceEmployee').value = '';
    document.getElementById('quickAdvanceType').value = 'cash';
    document.getElementById('quickAdvanceAmount').value = '';
    document.getElementById('quickAdvanceReason').value = '';
    document.getElementById('quickAdvanceDate').value = getSelectedAttendanceDate();
}

function clearAccessForm() {
    document.getElementById('accessFormTitle').textContent = 'Create Staff Login';
    document.getElementById('accessEmployeeId').value = '';
    document.getElementById('accessRole').value = currentAuthUser?.role === 'manager' ? 'cashier' : 'cashier';
    document.getElementById('accessUsername').value = '';
    document.getElementById('accessUsername').disabled = !canCreateStaffAccess();
    document.getElementById('accessStatus').value = 'true';
    document.getElementById('accessPassword').value = '';
    document.getElementById('accessPin').value = '';
    document.getElementById('createAccessBtn').classList.remove('hidden');
    document.getElementById('updateAccessBtn').classList.add('hidden');
    document.getElementById('cancelAccessEditBtn').classList.add('hidden');
}

async function getEmployee(id) {
    const employeeId = String(id);
    if (!employeeCache.length) {
        employeeCache = await getAllEmployees();
    }
    return employeeCache.find((employee) => String(employee.id) === employeeId) || null;
}

function findEmployeeById(id) {
    return employeeCache.find((employee) => String(employee.id) === String(id)) || null;
}

function employeeSortValue(employee) {
    return parseInt(String(employee.id || '').replace('E', ''), 10) || 0;
}

function getNextEmployeeNumericId() {
    const highestEmployeeId = employeeCache.reduce((highest, employee) => {
        const numericId = employeeSortValue(employee);
        return numericId > highest ? numericId : highest;
    }, 0);

    return highestEmployeeId + 1;
}

function setSuggestedEmployeeId(force = false) {
    if (isEditing) return;
    const idInput = document.getElementById('newEmpId');
    if (!idInput) return;
    if (!force && idInput.value.trim()) return;
    idInput.value = String(getNextEmployeeNumericId());
}

function getSelectedAttendanceDate() {
    return document.getElementById('attendanceDateInput')?.value || getTodayBusinessDateString();
}

function getSelectedPayrollMonth() {
    return document.getElementById('payrollMonthInput')?.value || getTodayBusinessDateString().slice(0, 7);
}

function attendanceClass(status) {
    const normalized = String(status || 'unmarked');
    if (normalized === 'present') return 'status-present';
    if (normalized === 'half-day') return 'status-half-day';
    if (normalized === 'absent') return 'status-absent';
    if (normalized === 'leave') return 'status-leave';
    return 'status-unmarked';
}

function attendanceLabel(status) {
    const normalized = String(status || 'unmarked');
    if (normalized === 'half-day') return 'Half Day';
    if (normalized === 'present') return 'Present';
    if (normalized === 'absent') return 'Absent';
    if (normalized === 'leave') return 'Leave';
    return 'Unmarked';
}

function roleBadgeClass(role) {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'admin') return 'role-admin';
    if (normalized === 'manager') return 'role-manager';
    if (normalized === 'salesman') return 'role-salesman';
    return 'role-cashier';
}

function formatCurrency(amount) {
    return `Rs.${Number(amount || 0).toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatLastLogin(value) {
    if (!value) return 'Never';
    try {
        return new Date(value).toLocaleString('en-LK', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Unknown';
    }
}

function formatDateLabel(value) {
    try {
        return new Date(value).toLocaleDateString('en-LK', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch {
        return value;
    }
}

function sortDescendingByDate(left, right) {
    return new Date(right || 0) - new Date(left || 0);
}

function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    const background = type === 'success'
        ? '#059669'
        : type === 'error'
            ? '#dc2626'
            : '#2563eb';

    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${background};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease;
        max-width: 420px;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
