// users.js
// Logic for administrator user account CRUD operations and role access gating

let allUsers = [];
let editingUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    
    // Check Authorization: Only Administrator role is allowed
    const currentUser = window.POS_API && typeof window.POS_API.getAuthUser === 'function' && window.POS_API.getAuthUser();
    if (!currentUser || currentUser.role !== 'admin') {
        document.getElementById('usersContent').classList.add('hidden');
        document.getElementById('deniedBanner').classList.remove('hidden');
        return;
    }

    await loadUsersList();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('saveUserBtn').addEventListener('click', handleSaveUser);
    document.getElementById('cancelUserBtn').addEventListener('click', resetForm);
}

async function loadUsersList() {
    try {
        if (typeof window.POS_API.getSystemUsers !== 'function') {
            throw new Error('User API wrapper is unavailable.');
        }

        allUsers = await window.POS_API.getSystemUsers();
        renderUsersTable(allUsers);
    } catch (err) {
        console.error('Failed to load user accounts:', err);
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-10 text-slate-500 italic">No user accounts found.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => {
        const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never';
        const roleMap = {
            admin: 'bg-red-500/10 text-red-500 border-red-500/20',
            manager: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
            cashier: 'bg-secondary/10 text-secondary border-secondary/20'
        };
        const roleBadge = `<span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${roleMap[u.role] || 'bg-slate-800 text-slate-400 border-slate-700/50'}">${u.role}</span>`;

        const statusBadge = u.isActive
            ? `<span class="bg-secondary/15 text-secondary border border-secondary/20 px-1.5 py-0.5 rounded font-bold">Active</span>`
            : `<span class="bg-red-500/15 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-bold">Inactive</span>`;

        return `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="px-5 py-4 font-bold text-white">${escapeHtml(u.username)}</td>
                <td class="px-5 py-4">${roleBadge}</td>
                <td class="px-5 py-4 text-slate-300 font-mono">${escapeHtml(u.employeeId || '—')}</td>
                <td class="px-5 py-4 text-center">${statusBadge}</td>
                <td class="px-5 py-4 text-slate-400">${lastLogin}</td>
                <td class="px-5 py-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="startEditUser('${u._id}')" class="bg-blue-700/40 hover:bg-blue-600 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">edit</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.startEditUser = function(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;

    editingUserId = userId;
    
    // Set form fields
    const usernameInput = document.getElementById('usrUsername');
    usernameInput.value = user.username;
    usernameInput.disabled = true; // Username cannot be modified

    document.getElementById('usrRole').value = user.role;
    document.getElementById('usrEmployeeId').value = user.employeeId || '';
    document.getElementById('usrIsActive').checked = !!user.isActive;

    // Clear password and PIN inputs, but update hints
    document.getElementById('usrPassword').value = '';
    document.getElementById('usrPin').value = '';
    document.getElementById('pwHint').textContent = 'Leave blank to keep current password.';

    // Change UI state
    document.getElementById('userFormTitle').innerHTML = `<span class="material-symbols-outlined text-primary">edit</span> Edit Account`;
};

async function handleSaveUser() {
    const usernameInput = document.getElementById('usrUsername');
    const passwordInput = document.getElementById('usrPassword');
    const roleInput = document.getElementById('usrRole');
    const empInput = document.getElementById('usrEmployeeId');
    const pinInput = document.getElementById('usrPin');
    const activeInput = document.getElementById('usrIsActive');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const role = roleInput.value;
    const employeeId = empInput.value.trim() || null;
    const pin = pinInput.value || null;
    const isActive = activeInput.checked;

    if (!editingUserId) {
        // Registering a new user
        if (!username) {
            alert('Username is required.');
            usernameInput.focus();
            return;
        }
        if (!password || password.length < 6) {
            alert('Password is required and must be at least 6 characters.');
            passwordInput.focus();
            return;
        }

        try {
            await window.POS_API.createSystemUserAccount({
                username, password, role, employeeId, pin
            });
            alert('Account created successfully!');
            resetForm();
            await loadUsersList();
        } catch (err) {
            console.error('Failed to register user:', err);
            alert('Failed to register user: ' + err.message);
        }
    } else {
        // Updating existing user
        const updates = { role, isActive, employeeId };
        if (password) {
            if (password.length < 6) {
                alert('Password must be at least 6 characters.');
                passwordInput.focus();
                return;
            }
            updates.password = password;
        }
        if (pin) {
            if (pin.length < 4 || isNaN(pin)) {
                alert('Override PIN must be a 4-digit numeric code.');
                pinInput.focus();
                return;
            }
            updates.pin = pin;
        }

        try {
            await window.POS_API.updateSystemUserAccount(editingUserId, updates);
            alert('User profile updated successfully!');
            resetForm();
            await loadUsersList();
        } catch (err) {
            console.error('Failed to update user profile:', err);
            alert('Failed to update profile: ' + err.message);
        }
    }
}

function resetForm() {
    editingUserId = null;
    
    const usernameInput = document.getElementById('usrUsername');
    usernameInput.value = '';
    usernameInput.disabled = false;

    document.getElementById('usrPassword').value = '';
    document.getElementById('usrRole').value = 'cashier';
    document.getElementById('usrEmployeeId').value = '';
    document.getElementById('usrPin').value = '';
    document.getElementById('usrIsActive').checked = true;
    document.getElementById('pwHint').textContent = 'Required for new users.';

    document.getElementById('userFormTitle').innerHTML = `<span class="material-symbols-outlined text-primary">person_add</span> Register Account`;
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}
