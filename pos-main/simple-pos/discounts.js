// ============================================================
// Fashion Shaa POS - AI Discounts & Promotions Logic (v5)
// ============================================================

let allRules = [];
let filterBindingsReady = false;

function escHtml(text) { const d = document.createElement('div'); d.textContent = text||''; return d.innerHTML; }
function formatNumber(value) { return Number(value || 0).toLocaleString(); }

function parseDateOnly(value) {
    if (!value) return null;
    const normalized = `${String(value).trim()}T00:00:00`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
}

function isRuleLiveNow(rule) {
    if (!rule || !rule.active) return false;
    const today = startOfToday();
    const start = parseDateOnly(rule.startDate);
    const end = parseDateOnly(rule.endDate);
    if (start && start > today) return false;
    if (end && end < today) return false;
    return true;
}

function isRuleScheduled(rule) {
    if (!rule || !rule.active) return false;
    const today = startOfToday();
    const start = parseDateOnly(rule.startDate);
    return Boolean(start && start > today);
}

function isRuleExpired(rule) {
    if (!rule) return false;
    const today = startOfToday();
    const end = parseDateOnly(rule.endDate);
    return Boolean(end && end < today);
}

function getRuleStatus(rule) {
    if (!rule?.active) return { label: 'Paused', className: 'status-paused' };
    if (isRuleScheduled(rule)) return { label: 'Scheduled', className: 'status-scheduled' };
    if (isRuleExpired(rule)) return { label: 'Expired', className: 'status-expired' };
    return { label: 'Live', className: 'status-live' };
}

function getRuleWindowLabel(rule) {
    const start = rule?.startDate || '';
    const end = rule?.endDate || '';
    if (start && end) return `${start} to ${end}`;
    if (start) return `Starts ${start}`;
    if (end) return `Until ${end}`;
    return 'Always available';
}

function getUniqueCoverageCount(rules) {
    if (rules.some((rule) => String(rule.appliesTo || 'all') === 'all')) {
        return 1;
    }

    return new Set(
        rules
            .map((rule) => String(rule.appliesTo || '').trim())
            .filter((value) => value && value !== 'selected')
    ).size;
}

function computeSummary(rules) {
    const liveRules = rules.filter(isRuleLiveNow);
    const scheduledRules = rules.filter(isRuleScheduled);
    const pausedRules = rules.filter((rule) => !rule.active);
    const thresholdRules = rules.filter((rule) => Number(rule.minPurchase || 0) > 0);
    const coverageCount = getUniqueCoverageCount(rules);
    const typeMix = {
        percentage: rules.filter((rule) => rule.type === 'percentage').length,
        fixed: rules.filter((rule) => rule.type === 'fixed').length,
        bogo: rules.filter((rule) => rule.type === 'bogo').length
    };

    return {
        total: rules.length,
        liveRules,
        scheduledRules,
        pausedRules,
        thresholdRules,
        coverageCount,
        typeMix
    };
}

function setElementText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderRuleLoadError(message) {
    const container = document.getElementById('rulesContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state-shell">
            <div class="flex items-start gap-4">
                <div class="empty-icon-wrap">
                    <span class="material-symbols-outlined text-primary text-2xl">sync_problem</span>
                </div>
                <div class="flex-1">
                    <h3 class="text-xl font-bold text-white">Couldn’t load discount rules</h3>
                    <p class="text-slate-400 mt-2 max-w-2xl">${escHtml(message || 'The discount service is unavailable right now.')}</p>
                    <p class="text-slate-500 text-sm mt-3">If this dashboard was opened outside the active POS session, reopen it from the signed-in register so it carries the current login token.</p>
                    <div class="flex flex-wrap gap-3 mt-4">
                        <button onclick="loadRules()" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-semibold text-sm border border-slate-700 transition-all">Retry</button>
                        <button onclick="openRuleModal()" class="bg-primary hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-primary/20">Draft Rule Offline</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderOverview(summary) {
    setElementText('metricLiveRules', formatNumber(summary.liveRules.length));
    setElementText('metricLiveNote', summary.liveRules.length
        ? `${summary.liveRules.length} campaign${summary.liveRules.length === 1 ? '' : 's'} currently influence checkout decisions.`
        : 'No promotions are live right now.');

    setElementText('metricTotalRules', formatNumber(summary.total));
    setElementText('metricTotalNote', summary.total
        ? `${summary.typeMix.percentage} percentage, ${summary.typeMix.fixed} fixed, ${summary.typeMix.bogo} BOGO in your playbook.`
        : 'Build percentage, fixed, and BOGO offers here.');

    setElementText('metricThresholdRules', formatNumber(summary.thresholdRules.length));
    setElementText('metricThresholdNote', summary.thresholdRules.length
        ? `${summary.thresholdRules.length} rule${summary.thresholdRules.length === 1 ? '' : 's'} use basket thresholds to protect margin.`
        : 'Add minimum purchase targets to keep big markdowns profitable.');

    setElementText('metricCoverage', formatNumber(summary.coverageCount));
    setElementText('metricCoverageNote', summary.coverageCount
        ? (summary.coverageCount === 1 && summary.total && summary.total === summary.liveRules.length && summary.liveRules.some((rule) => String(rule.appliesTo || 'all') === 'all')
            ? 'Live rules cover all inventory.'
            : `Targeting spans ${summary.coverageCount} rule coverage zone${summary.coverageCount === 1 ? '' : 's'}.`)
        : 'No category targeting configured yet.');
}

function renderInsights(summary) {
    const container = document.getElementById('ruleInsights');
    if (!container) return;

    const broadRules = allRules.filter((rule) => String(rule.appliesTo || 'all') === 'all');
    const thresholdTop = summary.thresholdRules[0];
    const broadTop = broadRules[0];

    const cards = [
        {
            icon: 'shield',
            title: 'Margin Guard',
            body: thresholdTop
                ? `${escHtml(thresholdTop.name)} protects bigger baskets with a minimum purchase of Rs.${formatNumber(thresholdTop.minPurchase)}.`
                : 'No threshold protection yet. Add a basket minimum to keep aggressive promotions margin-safe.',
            chips: [
                summary.thresholdRules.length ? `${summary.thresholdRules.length} guarded rule${summary.thresholdRules.length === 1 ? '' : 's'}` : 'No spend guardrails',
                summary.liveRules.length ? `${summary.liveRules.length} live now` : 'Ready to launch'
            ]
        },
        {
            icon: 'explore',
            title: 'Reach Pattern',
            body: broadTop
                ? `${escHtml(broadTop.name)} has the broadest reach because it applies across all items.`
                : 'Your current setup favors targeted campaigns. Add an all-items campaign if you need a short traffic spike.',
            chips: [
                broadRules.length ? `${broadRules.length} broad campaign${broadRules.length === 1 ? '' : 's'}` : 'Targeted only',
                `${summary.coverageCount} coverage zone${summary.coverageCount === 1 ? '' : 's'}`
            ]
        },
        {
            icon: 'auto_graph',
            title: 'Promotion Mix',
            body: summary.total
                ? `Your rule stack is ${summary.typeMix.percentage} percentage, ${summary.typeMix.fixed} fixed, and ${summary.typeMix.bogo} BOGO offers.`
                : 'Start with one traffic driver, one basket-lift rule, and one clearance-style rule for a balanced promotion mix.',
            chips: [
                summary.scheduledRules.length ? `${summary.scheduledRules.length} scheduled` : 'No scheduled drops',
                summary.pausedRules.length ? `${summary.pausedRules.length} paused` : 'No paused rules'
            ]
        }
    ];

    container.innerHTML = cards.map((card) => `
        <article class="insight-card flex flex-col gap-3">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-slate-900/55 border border-white/10 flex items-center justify-center">
                    <span class="material-symbols-outlined text-primary">${card.icon}</span>
                </div>
                <div>
                    <h3 class="font-bold text-white">${card.title}</h3>
                    <p class="text-xs text-slate-500 uppercase tracking-[0.18em]">Discount intelligence</p>
                </div>
            </div>
            <p class="text-sm text-slate-300 leading-relaxed">${card.body}</p>
            <div class="flex flex-wrap gap-2 mt-auto">
                ${card.chips.map((chip) => `<span class="insight-chip">${escHtml(chip)}</span>`).join('')}
            </div>
        </article>
    `).join('');
}

function updateAdvisorPanels(summary) {
    const summaryEl = document.getElementById('advisorRuleSummary');
    const opportunityEl = document.getElementById('advisorOpportunity');
    if (summaryEl) {
        summaryEl.innerHTML = [
            `<span class="insight-chip"><span class="material-symbols-outlined text-[14px] text-emerald-300">verified</span> Backend ready</span>`,
            `<span class="insight-chip"><span class="material-symbols-outlined text-[14px] text-blue-300">sell</span> ${summary.total} rules in system</span>`,
            `<span class="insight-chip"><span class="material-symbols-outlined text-[14px] text-fuchsia-300">campaign</span> ${summary.liveRules.length} live</span>`
        ].join('');
    }

    if (opportunityEl) {
        if (!summary.total) {
            opportunityEl.textContent = 'No active playbook yet. Start with a threshold offer, a category push, or let the advisor build your first safe campaign.';
        } else if (!summary.thresholdRules.length) {
            opportunityEl.textContent = 'Your current mix has no spend guardrails. A minimum purchase threshold is the easiest way to make discounts feel strong without bleeding margin.';
        } else if (!summary.liveRules.length) {
            opportunityEl.textContent = 'You already have rules drafted. Activate one scheduled campaign and compare it with a threshold offer to see which strategy lifts basket value faster.';
        } else {
            opportunityEl.textContent = `You have ${summary.liveRules.length} live campaign${summary.liveRules.length === 1 ? '' : 's'} running. Use the advisor to balance traffic-driving offers with threshold-led promotions that protect margin.`;
        }
    }
}

function bindFilterControls() {
    if (filterBindingsReady) return;
    ['ruleSearch', 'ruleFilterStatus', 'ruleFilterType'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', renderDiscountWorkspace);
        el.addEventListener('change', renderDiscountWorkspace);
    });
    filterBindingsReady = true;
}

function getActiveFilters() {
    return {
        search: String(document.getElementById('ruleSearch')?.value || '').trim().toLowerCase(),
        status: String(document.getElementById('ruleFilterStatus')?.value || 'all'),
        type: String(document.getElementById('ruleFilterType')?.value || 'all')
    };
}

function filterRules(rules) {
    const filters = getActiveFilters();
    return rules.filter((rule) => {
        if (filters.search) {
            const haystack = [
                rule.name,
                rule.description,
                rule.appliesTo,
                rule.type,
                getRuleWindowLabel(rule)
            ].join(' ').toLowerCase();
            if (!haystack.includes(filters.search)) return false;
        }

        if (filters.type !== 'all' && rule.type !== filters.type) return false;

        if (filters.status === 'live' && !isRuleLiveNow(rule)) return false;
        if (filters.status === 'scheduled' && !isRuleScheduled(rule)) return false;
        if (filters.status === 'paused' && rule.active) return false;
        if (filters.status === 'threshold' && !(Number(rule.minPurchase || 0) > 0)) return false;

        return true;
    });
}

function sortRules(rules) {
    return [...rules].sort((left, right) => {
        const leftStatus = isRuleLiveNow(left) ? 0 : isRuleScheduled(left) ? 1 : left.active ? 2 : 3;
        const rightStatus = isRuleLiveNow(right) ? 0 : isRuleScheduled(right) ? 1 : right.active ? 2 : 3;
        if (leftStatus !== rightStatus) return leftStatus - rightStatus;
        return String(left.name || '').localeCompare(String(right.name || ''));
    });
}

function renderEmptyState(hasRulesButFilteredOut) {
    const container = document.getElementById('rulesContainer');
    if (!container) return;

    if (hasRulesButFilteredOut) {
        container.innerHTML = `
            <div class="empty-state-shell">
                <div class="flex items-start gap-4">
                    <div class="empty-icon-wrap">
                        <span class="material-symbols-outlined text-primary text-2xl">filter_alt_off</span>
                    </div>
                    <div class="flex-1">
                        <h3 class="text-xl font-bold text-white">No rules match these filters</h3>
                        <p class="text-slate-400 mt-2 max-w-2xl">Try broadening the search, switching status, or clearing the filters to see the full promotion stack again.</p>
                        <div class="flex flex-wrap gap-3 mt-4">
                            <button onclick="clearRuleFilters()" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-semibold text-sm border border-slate-700 transition-all">Reset Filters</button>
                            <button onclick="openRuleModal()" class="bg-primary hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-primary/20">Create New Rule</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="empty-state-shell">
            <div class="flex flex-col lg:flex-row gap-6 lg:items-start">
                <div class="lg:max-w-sm">
                    <div class="empty-icon-wrap mb-4">
                        <span class="material-symbols-outlined text-primary text-2xl">local_offer</span>
                    </div>
                    <h3 class="text-2xl font-black text-white leading-tight">Build your first promotion stack</h3>
                    <p class="text-slate-400 mt-3 leading-relaxed">This area becomes your promotion control room. Start with a few proven campaigns so the advisor has structure to refine, compare, and expand.</p>
                    <div class="flex flex-wrap gap-2 mt-5">
                        <span class="insight-chip">Traffic drivers</span>
                        <span class="insight-chip">Basket uplift</span>
                        <span class="insight-chip">Margin guardrails</span>
                    </div>
                </div>
                <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 flex-1">
                    <div class="starter-tile">
                        <span class="type-badge rule-type-percent">Starter</span>
                        <h4 class="text-white font-bold text-lg mt-3">Weekend Traffic Push</h4>
                        <p class="text-slate-400 text-sm mt-2">A broad percentage campaign to wake up slower days without too much setup.</p>
                        <div class="flex flex-wrap gap-2 mt-4">
                            <span class="rule-meta-chip">10% off</span>
                            <span class="rule-meta-chip">All items</span>
                        </div>
                        <button onclick="applyStarterPreset('weekend')" class="mt-5 w-full bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-semibold text-sm border border-slate-700 transition-all">Use Template</button>
                    </div>
                    <div class="starter-tile">
                        <span class="type-badge rule-type-fixed">Starter</span>
                        <h4 class="text-white font-bold text-lg mt-3">Basket Lift Offer</h4>
                        <p class="text-slate-400 text-sm mt-2">A threshold-led discount that gives visible value while protecting margin.</p>
                        <div class="flex flex-wrap gap-2 mt-4">
                            <span class="rule-meta-chip">Rs.500 off</span>
                            <span class="rule-meta-chip">Min Rs.5000</span>
                        </div>
                        <button onclick="applyStarterPreset('threshold')" class="mt-5 w-full bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-semibold text-sm border border-slate-700 transition-all">Use Template</button>
                    </div>
                    <div class="starter-tile">
                        <span class="type-badge rule-type-bogo">Starter</span>
                        <h4 class="text-white font-bold text-lg mt-3">Accessories Pair Deal</h4>
                        <p class="text-slate-400 text-sm mt-2">A fast-moving BOGO format for add-on items and bundle behavior.</p>
                        <div class="flex flex-wrap gap-2 mt-4">
                            <span class="rule-meta-chip">BOGO</span>
                            <span class="rule-meta-chip">Accessories</span>
                        </div>
                        <button onclick="applyStarterPreset('bogo')" class="mt-5 w-full bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-semibold text-sm border border-slate-700 transition-all">Use Template</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function init() {
    await initDatabase();
    bindFilterControls();
    await loadRules();
}

async function loadRules() {
    try {
        allRules = await getAllDiscountRules();
        renderDiscountWorkspace();
    } catch(e) {
        console.error("Error loading rules:", e);
        allRules = [];
        renderOverview(computeSummary(allRules));
        renderInsights(computeSummary(allRules));
        updateAdvisorPanels(computeSummary(allRules));
        renderRuleLoadError(e?.message || 'Failed to load rules.');
    }
}

function renderDiscountWorkspace() {
    const summary = computeSummary(allRules);
    renderOverview(summary);
    renderInsights(summary);
    updateAdvisorPanels(summary);
    renderRules(filterRules(sortRules(allRules)));
}

function renderRules(rules) {
    const container = document.getElementById('rulesContainer');
    const hasFilters = Boolean(getActiveFilters().search) || getActiveFilters().status !== 'all' || getActiveFilters().type !== 'all';
    if (rules.length === 0) {
        renderEmptyState(hasFilters && allRules.length > 0);
        return;
    }

    const formatValue = (rule) => {
        if (rule.type === 'bogo') return 'Buy 1 Get 1';
        const isRange = rule.valueType === 'range';
        const min = Number(rule.valueMin || 0);
        const max = Number(rule.valueMax || 0);
        const v = Number(rule.value || 0);

        if (rule.type === 'percentage') {
            return isRange ? `${min}% - ${max}%` : `${v}%`;
        }
        if (rule.type === 'fixed') {
            return isRange ? `Rs. ${min} - ${max}` : `Rs. ${v}`;
        }
        return '';
    };

    container.innerHTML = rules.map(rule => {
        const isActive = !!rule.active;
        const id = String(rule.id);
        const typeClass = rule.type === 'percentage' ? 'rule-type-percent' : (rule.type === 'bogo' ? 'rule-type-bogo' : 'rule-type-fixed');
        const typeText = rule.type === 'percentage' ? '% OFF' : (rule.type === 'bogo' ? 'BOGO' : 'FIXED OFF');
        const status = getRuleStatus(rule);
        const windowLabel = getRuleWindowLabel(rule);

        return `
            <div class="rule-card ${isActive ? 'rule-active' : 'rule-inactive'} flex flex-col gap-4">
                <div class="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                    <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <span class="type-badge ${typeClass}">${typeText}</span>
                        <span class="status-pill ${status.className}">${status.label}</span>
                        <h3 class="font-bold text-white text-lg">${escHtml(rule.name)}</h3>
                    </div>
                    <p class="text-sm text-slate-400 mb-3">${escHtml(rule.description || 'No description')}</p>
                    <div class="flex flex-wrap gap-2">
                        <span class="rule-meta-chip"><span class="material-symbols-outlined text-[14px]">sell</span> ${formatValue(rule)}</span>
                        <span class="rule-meta-chip"><span class="material-symbols-outlined text-[14px]">inventory_2</span> ${escHtml(rule.appliesTo || 'all')}</span>
                        <span class="rule-meta-chip"><span class="material-symbols-outlined text-[14px]">calendar_today</span> ${escHtml(windowLabel)}</span>
                        ${rule.minPurchase ? `<span class="rule-meta-chip"><span class="material-symbols-outlined text-[14px]">shopping_cart</span> Min Rs.${formatNumber(rule.minPurchase)}</span>` : ''}
                    </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 xl:justify-end">
                    <button onclick="toggleRuleActive('${escHtml(id)}', ${!isActive})" class="${isActive ? 'text-amber-500 hover:text-amber-400' : 'text-emerald-500 hover:text-emerald-400'} border border-current px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        ${isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onclick="editRule('${escHtml(id)}')" class="text-blue-500 hover:text-blue-400 border border-current px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">Edit</button>
                    <button onclick="deleteRuleUI('${escHtml(id)}')" class="text-red-500 hover:text-red-400 border border-current px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Modal Logic
let editingRuleId = null;

function toggleRangeMode() {
    const isRange = document.getElementById('ruleIsRange')?.checked;
    const fields = document.getElementById('ruleRangeFields');
    const valueInput = document.getElementById('ruleValue');
    if (fields) fields.classList.toggle('hidden', !isRange);
    if (valueInput) valueInput.disabled = !!isRange;
    updateRuleValueLabel();
}

function openRuleModal() {
    editingRuleId = null;
    document.getElementById('ruleModalTitle').innerHTML = `<span class="material-symbols-outlined text-primary">local_offer</span> New Discount Rule`;
    document.getElementById('ruleName').value = '';
    document.getElementById('ruleType').value = 'percentage';
    document.getElementById('ruleValue').value = '';
    document.getElementById('ruleIsRange').checked = false;
    document.getElementById('ruleValueMin').value = '';
    document.getElementById('ruleValueMax').value = '';
    document.getElementById('ruleApplies').value = 'all';
    document.getElementById('ruleMinPurchase').value = '';
    document.getElementById('ruleStartDate').value = '';
    document.getElementById('ruleEndDate').value = '';
    document.getElementById('ruleDesc').value = '';
    document.getElementById('ruleActive').checked = true;

    toggleRangeMode();
    document.getElementById('ruleModal').classList.add('active');
}

function applyStarterPreset(presetKey) {
    openRuleModal();
    const presets = {
        weekend: {
            name: 'Weekend Traffic Push',
            type: 'percentage',
            value: 10,
            appliesTo: 'all',
            minPurchase: '',
            description: 'Short traffic-driving markdown for slower weekend windows.'
        },
        threshold: {
            name: 'Basket Lift Offer',
            type: 'fixed',
            value: 500,
            appliesTo: 'all',
            minPurchase: 5000,
            description: 'Margin-safer basket builder that rewards larger purchases.'
        },
        bogo: {
            name: 'Accessories Pair Deal',
            type: 'bogo',
            value: '',
            appliesTo: 'Accessories',
            minPurchase: '',
            description: 'Buy-one-get-one style offer designed to increase add-on item movement.'
        }
    };

    const preset = presets[presetKey];
    if (!preset) return;

    document.getElementById('ruleName').value = preset.name;
    document.getElementById('ruleType').value = preset.type;
    document.getElementById('ruleApplies').value = preset.appliesTo;
    document.getElementById('ruleMinPurchase').value = preset.minPurchase;
    document.getElementById('ruleDesc').value = preset.description;
    document.getElementById('ruleIsRange').checked = false;
    document.getElementById('ruleValueMin').value = '';
    document.getElementById('ruleValueMax').value = '';
    document.getElementById('ruleValue').value = preset.value;
    updateRuleValueLabel();
}

function clearRuleFilters() {
    const search = document.getElementById('ruleSearch');
    const status = document.getElementById('ruleFilterStatus');
    const type = document.getElementById('ruleFilterType');
    if (search) search.value = '';
    if (status) status.value = 'all';
    if (type) type.value = 'all';
    renderDiscountWorkspace();
}

function updateRuleValueLabel() {
    const type = document.getElementById('ruleType').value;
    const label = document.getElementById('ruleValueLabel');
    const isRange = document.getElementById('ruleIsRange')?.checked;
    const valueInput = document.getElementById('ruleValue');

    // Hide range toggle for BOGO
    const rangeToggle = document.getElementById('ruleIsRange')?.parentElement;
    const rangeFields = document.getElementById('ruleRangeFields');

    if (type === 'percentage') label.innerText = isRange ? 'Discount Range (%)' : 'Discount Value (%)';
    else if (type === 'fixed') label.innerText = isRange ? 'Discount Range (Rs.)' : 'Discount Value (Rs.)';
    else label.innerText = 'Value (Not required for BOGO)';

    if (type === 'bogo') {
        if (rangeToggle) rangeToggle.classList.add('hidden');
        if (rangeFields) rangeFields.classList.add('hidden');
        if (valueInput) {
            valueInput.value = '';
            valueInput.disabled = true;
        }
        return;
    }

    if (rangeToggle) rangeToggle.classList.remove('hidden');
    if (valueInput) valueInput.disabled = !!isRange;
}

function closeRuleModal() {
    document.getElementById('ruleModal').classList.remove('active');
}

async function saveRuleForm() {
    const name = document.getElementById('ruleName').value.trim();
    if (!name) { alert("Rule name is required."); return; }

    const type = document.getElementById('ruleType').value;
    const isRange = document.getElementById('ruleIsRange').checked;

    const rule = {
        name: name,
        type,
        appliesTo: document.getElementById('ruleApplies').value,
        minPurchase: parseFloat(document.getElementById('ruleMinPurchase').value) || 0,
        startDate: document.getElementById('ruleStartDate').value,
        endDate: document.getElementById('ruleEndDate').value,
        description: document.getElementById('ruleDesc').value.trim(),
        active: document.getElementById('ruleActive').checked
    };

    if (type === 'bogo') {
        rule.valueType = 'fixed';
        rule.value = 0;
        rule.valueMin = 0;
        rule.valueMax = 0;
    } else if (isRange) {
        rule.valueType = 'range';
        rule.value = 0;
        rule.valueMin = parseFloat(document.getElementById('ruleValueMin').value) || 0;
        rule.valueMax = parseFloat(document.getElementById('ruleValueMax').value) || 0;
    } else {
        rule.valueType = 'fixed';
        rule.value = parseFloat(document.getElementById('ruleValue').value) || 0;
        rule.valueMin = 0;
        rule.valueMax = 0;
    }

    if (String(type) === 'percentage') {
        const maxV = rule.valueType === 'range' ? rule.valueMax : rule.value;
        if (maxV > 100) { alert('Percentage discount cannot be more than 100%.'); return; }
    }

    if (editingRuleId) rule.id = String(editingRuleId);

    try {
        await saveDiscountRule(rule);
        closeRuleModal();
        loadRules();
    } catch(e) {
        console.error("Error saving rule:", e);
        alert(e?.message ? `Failed to save rule: ${e.message}` : "Failed to save rule.");
    }
}

async function editRule(id) {
    const rule = allRules.find(r => String(r.id) === String(id));
    if(!rule) return;

    editingRuleId = String(id);
    document.getElementById('ruleModalTitle').innerHTML = `<span class="material-symbols-outlined text-primary">edit</span> Edit Discount Rule`;
    document.getElementById('ruleName').value = rule.name;
    document.getElementById('ruleType').value = rule.type;
    document.getElementById('ruleApplies').value = rule.appliesTo || 'all';
    document.getElementById('ruleMinPurchase').value = rule.minPurchase || '';
    document.getElementById('ruleStartDate').value = rule.startDate || '';
    document.getElementById('ruleEndDate').value = rule.endDate || '';
    document.getElementById('ruleDesc').value = rule.description || '';
    document.getElementById('ruleActive').checked = !!rule.active;

    const isRange = rule.valueType === 'range';
    document.getElementById('ruleIsRange').checked = isRange;
    document.getElementById('ruleValue').value = !isRange ? (rule.value || '') : '';
    document.getElementById('ruleValueMin').value = isRange ? (rule.valueMin || '') : '';
    document.getElementById('ruleValueMax').value = isRange ? (rule.valueMax || '') : '';

    toggleRangeMode();
    document.getElementById('ruleModal').classList.add('active');
}

async function deleteRuleUI(id) {
    if(confirm("Are you sure you want to delete this rule?")) {
        try {
            await deleteDiscountRule(String(id));
            loadRules();
        } catch(e) {
            console.error(e);
            alert("Failed to delete rule");
        }
    }
}

async function toggleRuleActive(id, newState) {
    const rule = allRules.find(r => String(r.id) === String(id));
    if(rule) {
        rule.active = newState;
        await saveDiscountRule(rule);
        loadRules();
    }
}

// ==========================================
// Gemini AI Integration
// ==========================================

async function runAIAnalysis() {
    const context = document.getElementById('aiContext').value;
    const responseArea = document.getElementById('aiResponseArea');
    const btn = document.getElementById('aiAnalyzeBtn');
    
    // UI Loading state
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">refresh</span> Analyzing Data...`;
    responseArea.innerHTML = `
        <div class="space-y-3">
            <div class="shimmer h-4 rounded w-3/4"></div>
            <div class="shimmer h-4 rounded w-full"></div>
            <div class="shimmer h-4 rounded w-5/6"></div>
            <div class="shimmer h-24 rounded w-full mt-4"></div>
        </div>
    `;

    try {
        const payload = {
            context,
            currentRules: allRules.map((rule) => ({
                id: String(rule.id || ''),
                name: rule.name || '',
                type: rule.type || '',
                valueType: rule.valueType || 'fixed',
                value: Number(rule.value || 0),
                valueMin: Number(rule.valueMin || 0),
                valueMax: Number(rule.valueMax || 0),
                appliesTo: rule.appliesTo || 'all',
                minPurchase: Number(rule.minPurchase || 0),
                active: !!rule.active,
                description: rule.description || ''
            }))
        };

        const data = await fetchAPI('/ai/discount-advice', {
            method: 'POST',
            body: payload
        });
        const text = String(data.analysis || '').trim();
        if (!text) {
            throw new Error('The AI advisor returned an empty response.');
        }
        
        // Format response
        const formattedHTML = text
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
            .replace(/\*(.*?)\s/g, '<li class="ml-4 list-disc">$1</li>')
            .replace(/\n/g, '<br/>');

        responseArea.innerHTML = `
            <div class="bg-indigo-900/40 border border-indigo-500/30 rounded-xl p-5 text-indigo-100 text-sm leading-relaxed shadow-inner">
                ${formattedHTML}
                <div class="mt-4 pt-4 border-t border-indigo-500/30 flex justify-end">
                    <button onclick="openRuleModal()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                        <span class="material-symbols-outlined text-[14px]">add</span> Create Rule from Suggestion
                    </button>
                </div>
            </div>
        `;

    } catch(e) {
        console.error("AI Analysis failed:", e);
        responseArea.innerHTML = `
            <div class="bg-red-900/40 border border-red-500/30 rounded-xl p-4 text-red-200 text-sm">
                <span class="material-symbols-outlined text-red-400 float-left mr-2 mt-0.5">error</span>
                <strong>Failed to connect to AI Advisor.</strong><br/>
                ${escHtml(e?.message || 'Please verify the backend Gemini key and internet connection.')}
            </div>
        `;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-sm">auto_awesome</span> Analyze & Suggest Discounts`;
    }
}

init();

/* placeholder aria-label */
