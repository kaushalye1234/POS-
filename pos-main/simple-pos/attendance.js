let attendanceEmployees = [];
let attendanceRecords = [];
let attendanceAuthUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    attendanceAuthUser = window.POS_API?.getAuthUser?.() || null;

    initAttendanceDefaults();
    setupAttendanceEvents();

    if (!canManageAttendance()) {
        renderAttendanceRestrictedState();
        return;
    }

    try {
        const dbPromise = initDatabase();
        const timeoutPromise = new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('Database initialization timed out.')), 5000);
        });

        await Promise.race([dbPromise, timeoutPromise]);
        await reloadAttendanceWorkspace();
    } catch (error) {
        console.error('Failed to initialize attendance workspace:', error);
        renderAttendanceLoadFailure(error.message || 'Failed to load attendance workspace.');
        showAttendanceToast(error.message || 'Failed to load attendance workspace.', 'error');
    }
});

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

function canManageAttendance() {
    return ['admin', 'manager'].includes(attendanceAuthUser?.role);
}

function initAttendanceDefaults() {
    const input = document.getElementById('attendanceDateInput');
    if (input && !input.value) {
        input.value = getTodayBusinessDateString();
    }
}

function setupAttendanceEvents() {
    document.getElementById('attendanceDateInput')?.addEventListener('change', renderAttendanceWorkspace);
    document.getElementById('attendanceTodayBtn')?.addEventListener('click', () => {
        const input = document.getElementById('attendanceDateInput');
        if (input) {
            input.value = getTodayBusinessDateString();
        }
        renderAttendanceWorkspace();
    });
    document.getElementById('attendanceReloadBtn')?.addEventListener('click', async () => {
        await reloadAttendanceWorkspace();
        showAttendanceToast('Attendance data refreshed.', 'info');
    });

    window.addEventListener('focus', () => {
        if (canManageAttendance()) {
            void reloadAttendanceWorkspace();
        }
    });
}

async function reloadAttendanceWorkspace() {
    attendanceEmployees = await getAllEmployees();
    attendanceEmployees.sort((left, right) => employeeSortValue(left) - employeeSortValue(right));
    attendanceRecords = await getAllAttendance();
    renderAttendanceWorkspace();
}

function renderAttendanceWorkspace() {
    renderAttendanceSummary();
    renderAttendanceRoster();
}

function renderAttendanceRestrictedState() {
    const message = attendanceAuthUser
        ? 'Only admins and managers can mark attendance.'
        : 'Sign in as an admin or manager to mark attendance.';

    const summary = document.getElementById('attendanceSummary');
    const roster = document.getElementById('attendanceRoster');
    const subtitle = document.getElementById('attendanceRosterSubtitle');

    if (summary) {
        summary.innerHTML = `<div class="glass-card rounded-2xl p-6 text-amber-300 border border-amber-500/20 sm:col-span-2 xl:col-span-5">${escapeHtml(message)}</div>`;
    }
    if (roster) {
        roster.innerHTML = `<div class="empty-mini">${escapeHtml(message)}</div>`;
    }
    if (subtitle) {
        subtitle.textContent = message;
    }
}

function renderAttendanceLoadFailure(message) {
    const summary = document.getElementById('attendanceSummary');
    const roster = document.getElementById('attendanceRoster');
    const subtitle = document.getElementById('attendanceRosterSubtitle');
    const safeMessage = escapeHtml(message || 'Failed to load attendance workspace.');

    if (summary) {
        summary.innerHTML = `<div class="glass-card rounded-2xl p-6 text-rose-300 border border-rose-500/20 sm:col-span-2 xl:col-span-5">${safeMessage}</div>`;
    }
    if (roster) {
        roster.innerHTML = `<div class="empty-mini">${safeMessage}</div>`;
    }
    if (subtitle) {
        subtitle.textContent = message || 'Failed to load attendance workspace.';
    }
}

function getSelectedAttendanceDate() {
    return document.getElementById('attendanceDateInput')?.value || getTodayBusinessDateString();
}

function getAttendanceStatusMapForDate(date) {
    const map = new Map();
    attendanceRecords
        .filter((record) => record.date === date)
        .forEach((record) => map.set(record.employeeId, record.status));
    return map;
}

function renderAttendanceSummary() {
    const container = document.getElementById('attendanceSummary');
    if (!container) return;

    const selectedDate = getSelectedAttendanceDate();
    const statusMap = getAttendanceStatusMapForDate(selectedDate);

    const totals = {
        present: 0,
        halfDay: 0,
        absent: 0,
        leave: 0,
        unmarked: 0
    };

    attendanceEmployees.forEach((employee) => {
        const status = statusMap.get(employee.id) || 'unmarked';
        if (status === 'present') totals.present += 1;
        else if (status === 'half-day') totals.halfDay += 1;
        else if (status === 'absent') totals.absent += 1;
        else if (status === 'leave') totals.leave += 1;
        else totals.unmarked += 1;
    });

    container.innerHTML = `
        <div class="ops-stat-card">
            <div class="ops-label">Workers</div>
            <div class="ops-stat-value">${attendanceEmployees.length}</div>
            <div class="mt-2 text-sm text-slate-400">Roster for ${formatDateLabel(selectedDate)}</div>
        </div>
        <div class="ops-stat-card">
            <div class="ops-label">Present</div>
            <div class="ops-stat-value text-emerald-300">${totals.present}</div>
            <div class="mt-2 text-sm text-slate-400">Marked fully present</div>
        </div>
        <div class="ops-stat-card">
            <div class="ops-label">Half Day</div>
            <div class="ops-stat-value text-amber-300">${totals.halfDay}</div>
            <div class="mt-2 text-sm text-slate-400">Partial workday</div>
        </div>
        <div class="ops-stat-card">
            <div class="ops-label">Absent / Leave</div>
            <div class="ops-stat-value text-rose-300">${totals.absent + totals.leave}</div>
            <div class="mt-2 text-sm text-slate-400">${totals.absent} absent, ${totals.leave} leave</div>
        </div>
        <div class="ops-stat-card">
            <div class="ops-label">Unmarked</div>
            <div class="ops-stat-value text-slate-200">${totals.unmarked}</div>
            <div class="mt-2 text-sm text-slate-400">Still waiting to be marked</div>
        </div>
    `;
}

function renderAttendanceRoster() {
    const roster = document.getElementById('attendanceRoster');
    const subtitle = document.getElementById('attendanceRosterSubtitle');
    if (!roster) return;

    if (!attendanceEmployees.length) {
        roster.innerHTML = '<div class="empty-mini">Add workers first so attendance can be marked.</div>';
        if (subtitle) {
            subtitle.textContent = 'No workers are available yet.';
        }
        return;
    }

    const selectedDate = getSelectedAttendanceDate();
    const statusMap = getAttendanceStatusMapForDate(selectedDate);

    if (subtitle) {
        subtitle.textContent = `Mark each worker for ${formatDateLabel(selectedDate)}.`;
    }

    roster.innerHTML = attendanceEmployees.map((employee) => {
        const status = statusMap.get(employee.id) || 'unmarked';
        return `
            <div class="attendance-row">
                <div class="min-w-0">
                    <div class="text-sm font-bold text-white truncate">${escapeHtml(employee.name)}</div>
                    <div class="mt-1 text-xs text-slate-400">${escapeHtml(employee.id)} • ${escapeHtml(employee.role || 'cashier')} • Salary ${formatCurrency(employee.baseSalary)}</div>
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

window.markAttendanceStatus = async function markAttendanceStatus(employeeId, status) {
    if (!canManageAttendance()) {
        showAttendanceToast('You do not have permission to mark attendance.', 'error');
        return;
    }

    const employee = attendanceEmployees.find((entry) => String(entry.id) === String(employeeId));
    if (!employee) {
        showAttendanceToast('Worker not found.', 'error');
        return;
    }

    try {
        await saveAttendanceRecord({
            employeeId: employee.id,
            employeeName: employee.name,
            date: getSelectedAttendanceDate(),
            status,
            markedBy: attendanceAuthUser?.username || 'system'
        });
        attendanceRecords = await getAllAttendance();
        renderAttendanceWorkspace();
        showAttendanceToast(`${employee.name} marked as ${attendanceLabel(status)}.`, 'success');
    } catch (error) {
        console.error('Failed to save attendance:', error);
        showAttendanceToast(error.message || 'Failed to mark attendance.', 'error');
    }
};

function employeeSortValue(employee) {
    return parseInt(String(employee?.id || '').replace('E', ''), 10) || 0;
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

function formatCurrency(amount) {
    return `Rs.${Number(amount || 0).toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
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

function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

let toastTimerId = null;
function showAttendanceToast(message, type = 'info') {
    const toast = document.getElementById('attendanceToast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast show toast-${type}`;
    window.clearTimeout(toastTimerId);
    toastTimerId = window.setTimeout(() => {
        toast.className = 'toast toast-info';
    }, 2600);
}
