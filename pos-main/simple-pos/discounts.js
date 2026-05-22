// ============================================================
// Fashion Shaa POS - AI Discounts & Promotions Logic (v5)
// ============================================================

let allRules = [];

function escHtml(text) { const d = document.createElement('div'); d.textContent = text||''; return d.innerHTML; }

async function init() {
    await initDatabase();
    
    // Load API Key if saved
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        document.getElementById('geminiApiKey').value = savedKey;
    }

    await loadRules();
}

async function loadRules() {
    const container = document.getElementById('rulesContainer');
    try {
        allRules = await getAllDiscountRules();
        renderRules(allRules);
    } catch(e) {
        console.error("Error loading rules:", e);
        container.innerHTML = `<div class="text-slate-500 text-center py-8">Failed to load rules.</div>`;
    }
}

function renderRules(rules) {
    const container = document.getElementById('rulesContainer');
    if (rules.length === 0) {
        container.innerHTML = `<div class="rule-card text-center text-slate-500 py-8">No discount rules found. Click "New Rule" to create one.</div>`;
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

        return `
            <div class="rule-card ${isActive ? 'rule-active' : 'rule-inactive'} flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="type-badge ${typeClass}">${typeText}</span>
                        <h3 class="font-bold text-white text-lg">${escHtml(rule.name)}</h3>
                    </div>
                    <p class="text-sm text-slate-400 mb-2">${escHtml(rule.description || 'No description')}</p>
                    <div class="flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
                        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">sell</span> ${formatValue(rule)}</span>
                        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">inventory_2</span> Applies To: ${escHtml(rule.appliesTo || 'all')}</span>
                        ${rule.minPurchase ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">shopping_cart</span> Min: Rs.${rule.minPurchase}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="toggleRuleActive('${escHtml(id)}', ${!isActive})" class="${isActive ? 'text-amber-500 hover:text-amber-400' : 'text-emerald-500 hover:text-emerald-400'} border border-current px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        ${isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onclick="editRule('${escHtml(id)}')" class="text-blue-500 hover:text-blue-400 border border-current px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">Edit</button>
                    <button onclick="deleteRuleUI('${escHtml(id)}')" class="text-red-500 hover:text-red-400 border border-current px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">Delete</button>
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

function saveApiKey() {
    const key = document.getElementById('geminiApiKey').value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        alert("API Key saved securely in your browser!");
    } else {
        localStorage.removeItem('gemini_api_key');
        alert("API Key removed.");
    }
}

async function runAIAnalysis() {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        alert("Please enter your Gemini API Key first.");
        document.getElementById('geminiApiKey').focus();
        return;
    }

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

    // Construct prompt
    const storeInfo = `Fashion Shaa is a clothing retail store. Current active discount rules: ${allRules.map(r=>r.name).join(', ') || 'None'}.`;
    const scenarios = {
        'general': 'Suggest 3 general promotional ideas to increase everyday revenue.',
        'slow_season': 'We are experiencing low foot traffic. Suggest 3 aggressive promotions to drive customers into the store.',
        'new_stock': 'We have a lot of dead stock. Suggest 3 clearance sale ideas to get rid of old inventory.',
        'loyalty': 'Suggest 3 reward ideas for our VIP loyalty customers.',
        'competitor': 'A competitor opened nearby. Suggest 3 competitive discount strategies to retain our customers.',
        'holiday': 'A major holiday is coming up next week. Suggest 3 festive promotional campaigns.'
    };
    
    const prompt = `You are an expert retail business strategist for a clothing store named Fashion Shaa.
    ${storeInfo}
    Scenario: ${scenarios[context] || scenarios['general']}
    
    Provide your response in a structured format: High-level strategy paragraph, followed by 3 specific, actionable discount rules we can implement into our POS system.
    Keep it concise, formatting with bold text and bullet points. Do not include markdown code blocks.`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
            })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        
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
                Please verify your Gemini API key is correct and you have an active internet connection.
            </div>
        `;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-sm">auto_awesome</span> Analyze & Suggest Discounts`;
    }
}

init();

/* placeholder aria-label */
