(function initProfile() {
    const authUser = window.POS_API?.getAuthUser?.();

    if (!authUser || !window.POS_API?.isAuthenticated?.()) {
        window.location.replace('index.html');
        return;
    }

    const logoutBtn = document.getElementById('profileLogoutBtn');
    logoutBtn?.addEventListener('click', () => {
        window.POS_API.logoutUser();
        window.location.replace('index.html');
    });

    loadProfile(authUser);
})();

async function loadProfile(fallbackUser) {
    let user = fallbackUser;

    try {
        if (window.POS_API?.fetchAPI) {
            user = await window.POS_API.fetchAPI('/auth/me');
        }
    } catch (error) {
        console.warn('Falling back to cached auth user for profile:', error);
    }

    renderProfile(user || fallbackUser);
}

function renderProfile(user) {
    const username = user?.username || 'User';
    const role = String(user?.role || 'cashier').toLowerCase();
    const employeeId = user?.employeeId || 'Not linked';
    const isActive = user?.isActive === false ? 'Deactivated' : 'Active';
    const lastLogin = formatDateTime(user?.lastLogin);
    const createdAt = formatDateTime(user?.createdAt);

    document.getElementById('profileName').textContent = username;
    document.getElementById('profileUsername').textContent = username;
    document.getElementById('profileRole').textContent = capitalize(role);
    document.getElementById('profileEmployeeId').textContent = employeeId;
    document.getElementById('profileEmployeeBadge').textContent = employeeId === 'Not linked' ? 'No employee link' : employeeId;
    document.getElementById('profileStatus').textContent = isActive;
    document.getElementById('profileLastLogin').textContent = lastLogin;
    document.getElementById('profileCreatedAt').textContent = createdAt;

    const badge = document.getElementById('profileRoleBadge');
    badge.textContent = capitalize(role);
    badge.className = `rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${roleClass(role)}`;

    const avatar = document.getElementById('profileAvatar');
    avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=0f172a&color=e11d48&size=160&bold=true`;
    avatar.alt = `${username} avatar`;

    renderQuickLinks(role);
}

function renderQuickLinks(role) {
    const links = [
        {
            href: 'index.html',
            icon: 'point_of_sale',
            title: 'Register',
            description: 'Go back to the live checkout screen.'
        }
    ];

    if (role !== 'cashier') {
        links.push({
            href: 'dashboard.html',
            icon: 'dashboard',
            title: 'Dashboard',
            description: 'Open reports, returns, shifts, and operations.'
        });
        links.push({
            href: 'items.html',
            icon: 'inventory_2',
            title: 'Inventory',
            description: 'Manage stock, item setup, and performance.'
        });
    }

    if (role === 'admin' || role === 'manager') {
        links.push({
            href: 'employees.html',
            icon: 'badge',
            title: 'Employees & Access',
            description: 'Add workers and manage permissions.'
        });
    }

    if (role === 'admin') {
        links.push({
            href: 'settings.html',
            icon: 'settings',
            title: 'Settings',
            description: 'Review system configuration and feature controls.'
        });
    }

    const container = document.getElementById('profileQuickLinks');
    container.innerHTML = links.map((link) => `
        <a href="${link.href}" class="quick-link">
            <div class="flex min-w-0 items-center gap-3">
                <div class="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80">
                    <span class="material-symbols-outlined text-slate-200">${link.icon}</span>
                </div>
                <div class="min-w-0">
                    <div class="truncate text-sm font-bold text-white">${escapeHtml(link.title)}</div>
                    <div class="mt-1 text-sm muted">${escapeHtml(link.description)}</div>
                </div>
            </div>
            <span class="material-symbols-outlined text-slate-500">chevron_right</span>
        </a>
    `).join('');
}

function formatDateTime(value) {
    if (!value) return 'Not available';

    try {
        return new Date(value).toLocaleString('en-LK', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Not available';
    }
}

function roleClass(role) {
    if (role === 'admin') return 'role-admin';
    if (role === 'manager') return 'role-manager';
    return 'role-cashier';
}

function capitalize(value) {
    const text = String(value || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
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
