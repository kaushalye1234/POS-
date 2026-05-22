let syncStatusCache = null;
let healthSnapshotCache = null;
let syncActionInFlight = false;
const AUTO_REFRESH_INTERVAL_MS = 30000;
let autoRefreshTimer = null;

function escHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function formatDateTime(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-LK', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatDurationMs(ms) {
    const value = Number(ms || 0);
    if (!value) return 'Off';
    if (value < 60000) return `${Math.round(value / 1000)}s`;
    const minutes = Math.round(value / 60000);
    return `${minutes} min`;
}

function formatTimeOnly(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-LK', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
    });
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function setPill(id, label, className) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `status-pill ${className}`;
    el.textContent = label;
}

function getStoredAuthUser() {
    return window.POS_API?.getAuthUser?.() || null;
}

function isAdminUser() {
    const user = getStoredAuthUser();
    return Boolean(user && user.role === 'admin');
}

function applyAccessState() {
    const isAdmin = isAdminUser();
    const accessState = document.getElementById('accessState');
    const syncApp = document.getElementById('syncApp');
    if (accessState) accessState.classList.toggle('hidden', isAdmin);
    if (syncApp) syncApp.classList.toggle('hidden', !isAdmin);
    return isAdmin;
}

async function fetchHealthSnapshot() {
    const apiBase = window.POS_API?.getApiBase?.();
    if (!apiBase) throw new Error('API base is not available.');

    const headers = {};
    const token = window.POS_API?.getAuthToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${apiBase}/health`, {
        method: 'GET',
        headers,
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`Health check failed (${response.status})`);
    }

    return response.json();
}

function buildCollectionMap(status) {
    const map = new Map();
    const latestCollections = status?.lastRun?.collections || [];
    latestCollections.forEach((entry) => {
        map.set(entry.collection, entry);
    });
    return map;
}

function renderHeaderChips(status, health) {
    const activeSource = status?.activeSource || health?.database?.activeSource || 'unknown';
    const syncEnabled = status?.enabled ? 'Auto sync on' : 'Manual sync';
    const mode = health?.database?.connectionMode || '—';
    const updatedAt = formatTimeOnly(health?.timestamp);
    setHTML('syncHeaderChips', [
        `<span class="info-chip"><span class="material-symbols-outlined text-[14px] text-emerald-300">dns</span> ${escHtml(activeSource)} active</span>`,
        `<span class="info-chip"><span class="material-symbols-outlined text-[14px] text-blue-300">hub</span> ${escHtml(mode)} mode</span>`,
        `<span class="info-chip"><span class="material-symbols-outlined text-[14px] text-fuchsia-300">sync</span> ${escHtml(syncEnabled)}</span>`,
        updatedAt
            ? `<span class="info-chip"><span class="material-symbols-outlined text-[14px] text-amber-300">schedule</span> Updated ${escHtml(updatedAt)}</span>`
            : ''
    ].join(''));
}

function renderOverview(status, health) {
    const activeSource = status?.activeSource || health?.database?.activeSource || 'unknown';
    const lastRun = status?.lastRun || null;
    const direction = lastRun ? `${lastRun.source} -> ${lastRun.target}` : 'No completed sync yet';
    const processed = lastRun?.totals?.processed || 0;

    setText('metricActiveSource', String(activeSource).toUpperCase());
    setText('metricActiveSourceNote', health?.database?.fallbackUsed
        ? 'Fallback routing is active because the preferred source was unavailable.'
        : 'Primary source currently serving the POS backend.');

    setText('metricSyncMode', String(health?.database?.connectionMode || status?.enabled && 'AUTO' || '—').toUpperCase());
    setText('metricSyncModeNote', status?.enabled
        ? 'Automatic sync is enabled between local and online databases.'
        : 'Manual sync only. Trigger sync jobs when needed.');

    setText('metricLastRun', lastRun ? formatDateTime(lastRun.completedAt) : 'Never');
    setText('metricLastRunNote', lastRun
        ? `${direction} copied ${processed} document${processed === 1 ? '' : 's'}.`
        : 'No sync has been recorded yet.');

    setText('metricInterval', formatDurationMs(status?.intervalMs));
    setText('metricIntervalNote', status?.enabled
        ? (status?.onStartup ? 'Startup sync enabled before repeating in the background.' : 'Background sync cadence for the standby database.')
        : 'Background sync is turned off.');

    setText('syncTopologyText', `The backend is serving from ${activeSource}. “Active -> Standby” will copy changes from ${activeSource} into the other database.`);
    setText('syncOutcomeText', lastRun
        ? `${direction} finished at ${formatDateTime(lastRun.completedAt)} with ${processed} documents processed.`
        : 'No sync job has finished yet in this server session.');

    setPill('syncRunningPill', status?.running ? 'Sync Running' : 'Idle', status?.running ? 'status-warning' : 'status-live');
    setPill('healthStatusPill', health?.status === 'ok' ? 'Healthy' : 'Degraded', health?.status === 'ok' ? 'status-live' : 'status-danger');

    setText('localTargetUri', status?.configuredTargets?.local || 'Not configured');
    setText('remoteTargetUri', status?.configuredTargets?.remote || 'Not configured');

    if (status?.lastError) {
        setText('lastErrorText', `${status.lastError.at}: ${status.lastError.message}`);
    } else {
        setText('lastErrorText', 'No sync errors recorded.');
    }
}

function renderCollections(status) {
    const container = document.getElementById('collectionGrid');
    if (!container) return;

    const collectionMap = buildCollectionMap(status);
    const availableCollections = status?.availableCollections || [];
    const totalProcessed = status?.lastRun?.totals?.processed || 0;
    setHTML('collectionSummaryChip', `
        <span class="material-symbols-outlined text-[14px] text-blue-300">table_rows</span>
        ${escHtml(status?.lastRun
            ? `${availableCollections.length} collections tracked • ${totalProcessed} docs processed last run`
            : `${availableCollections.length} collections tracked`)}
    `);

    if (!availableCollections.length) {
        container.innerHTML = `
            <div class="empty-shell">
                <h3 class="text-lg font-bold text-white">No collection metadata yet</h3>
                <p class="text-slate-400 mt-2">Refresh the sync center after the backend reports sync availability.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = availableCollections.map((entry) => {
        const stats = collectionMap.get(entry.collectionName);
        return `
            <article class="collection-card">
                <div class="flex items-center justify-between gap-3 mb-3">
                    <div>
                        <h3 class="font-bold text-white">${escHtml(entry.modelName)}</h3>
                        <p class="text-xs uppercase tracking-[0.18em] text-slate-500">${escHtml(entry.collectionName)}</p>
                    </div>
                    <span class="info-chip">
                        <span class="material-symbols-outlined text-[14px] text-blue-300">database</span>
                        ${stats ? `${stats.processed} docs` : 'No run yet'}
                    </span>
                </div>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="rounded-xl bg-slate-950/20 border border-white/8 p-3">
                        <div class="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Matched</div>
                        <div class="text-xl font-black text-white mt-1">${stats ? stats.matched : 0}</div>
                    </div>
                    <div class="rounded-xl bg-slate-950/20 border border-white/8 p-3">
                        <div class="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Upserted</div>
                        <div class="text-xl font-black text-emerald-300 mt-1">${stats ? stats.upserted : 0}</div>
                    </div>
                    <div class="rounded-xl bg-slate-950/20 border border-white/8 p-3">
                        <div class="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Modified</div>
                        <div class="text-xl font-black text-amber-300 mt-1">${stats ? stats.modified : 0}</div>
                    </div>
                    <div class="rounded-xl bg-slate-950/20 border border-white/8 p-3">
                        <div class="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Processed</div>
                        <div class="text-xl font-black text-fuchsia-300 mt-1">${stats ? stats.processed : 0}</div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function setActionButtonsDisabled(disabled) {
    syncActionInFlight = disabled;
    const refreshButton = document.getElementById('syncRefreshBtn');
    if (refreshButton) {
        refreshButton.disabled = disabled;
    }
    updateSyncButtons(syncStatusCache);
}

function updateSyncButtons(status = null) {
    const manualButtons = document.querySelectorAll('[data-sync-action]');
    const shouldDisable = syncActionInFlight || !isAdminUser() || Boolean(status?.running);
    manualButtons.forEach((button) => {
        button.disabled = shouldDisable;
    });
}

function startAutoRefresh() {
    if (autoRefreshTimer) return;
    autoRefreshTimer = window.setInterval(() => {
        if (document.hidden || syncActionInFlight || !isAdminUser()) return;
        refreshSyncStatus();
    }, AUTO_REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
    if (!autoRefreshTimer) return;
    window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
}

async function refreshSyncStatus() {
    if (!applyAccessState()) return;

    try {
        setActionButtonsDisabled(true);
        const [status, health] = await Promise.all([
            window.POS_API.getSyncStatus(),
            fetchHealthSnapshot()
        ]);
        syncStatusCache = status;
        healthSnapshotCache = health;
        renderHeaderChips(status, health);
        renderOverview(status, health);
        renderCollections(status);
        updateSyncButtons(status);
    } catch (error) {
        console.error('Failed to load sync status:', error);
        setPill('healthStatusPill', 'Unavailable', 'status-danger');
        setText('syncOutcomeText', error?.message || 'Failed to load sync status.');
        setText('lastErrorText', error?.message || 'Failed to load sync status.');
    } finally {
        setActionButtonsDisabled(false);
    }
}

async function triggerSync(direction) {
    if (!applyAccessState() || syncActionInFlight) return;

    const labels = {
        'active-to-standby': 'Active -> Standby',
        'local-to-remote': 'Local -> Online',
        'remote-to-local': 'Online -> Local'
    };

    const confirmed = window.confirm(`Run ${labels[direction] || direction} sync now?`);
    if (!confirmed) return;

    try {
        setActionButtonsDisabled(true);
        const result = await window.POS_API.runMongoSync({ direction });
        const processed = result?.summary?.totals?.processed || 0;
        await refreshSyncStatus();
        window.alert(`${labels[direction] || 'Sync'} completed. ${processed} document${processed === 1 ? '' : 's'} processed.`);
    } catch (error) {
        console.error('Sync run failed:', error);
        const message = error?.message || 'Sync failed.';
        window.alert(
            message.includes('already running')
                ? 'A sync job is already running in the background. Please wait a few seconds and try again.'
                : message
        );
        await refreshSyncStatus();
    } finally {
        setActionButtonsDisabled(false);
    }
}

applyAccessState();
refreshSyncStatus();
startAutoRefresh();

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isAdminUser() && !syncActionInFlight) {
        refreshSyncStatus();
    }
});

window.addEventListener('beforeunload', stopAutoRefresh);
