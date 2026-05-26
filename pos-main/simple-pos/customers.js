// ============================================================
// Fashion Shaa POS - Customer Management (v4)
// ============================================================

let allCustomers = [];
let editingCustomerId = null;
let detailCustomerId = null;
let currentPhotoDataUrl = null;
let customerSalesById = new Map();

// Loyalty tier thresholds
const TIERS = [
    { name: 'Platinum', min: 5000, class: 'tier-platinum', color: '#c084fc' },
    { name: 'Gold',     min: 2000, class: 'tier-gold',     color: '#fbbf24' },
    { name: 'Silver',  min: 500,  class: 'tier-silver',   color: '#cbd5e1' },
    { name: 'Bronze',  min: 0,    class: 'tier-bronze',   color: '#fb923c' }
];

function getTier(points) {
    return TIERS.find(t => (points || 0) >= t.min) || TIERS[3];
}

function formatCurrency(amount) {
    return 'Rs.' + (amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDateValue(dateValue, timeValue = '') {
    const rawDate = String(dateValue || '').trim();
    const rawTime = String(timeValue || '').trim();
    if (!rawDate) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        const parsed = new Date(`${rawDate}T${rawTime || '00:00:00'}`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(rawDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateDisplay(dateValue, options = {}) {
    const parsed = parseDateValue(dateValue);
    if (!parsed) return '—';

    return new Intl.DateTimeFormat('en-LK', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options
    }).format(parsed);
}

function getNextTier(points) {
    const currentTier = getTier(points);
    const currentIndex = TIERS.findIndex((tier) => tier.name === currentTier.name);
    return currentIndex > 0 ? TIERS[currentIndex - 1] : null;
}

function getTierProgress(points) {
    const currentPoints = Number(points || 0);
    const nextTier = getNextTier(currentPoints);
    if (!nextTier) {
        return { progress: 100, nextTier: null, pointsToNextTier: 0 };
    }

    return {
        progress: Math.min(100, (currentPoints / nextTier.min) * 100),
        nextTier,
        pointsToNextTier: Math.max(0, nextTier.min - currentPoints)
    };
}

function getSaleReference(saleId) {
    const normalized = String(saleId || '').trim();
    return normalized ? `SALE-${normalized.slice(-6).toUpperCase()}` : 'Pending';
}

function buildCustomerProfiles(customers, sales) {
    const activityById = new Map();
    const uniqueNameToId = new Map();

    customers.forEach((customer) => {
        const customerId = String(customer.id || '').trim();
        activityById.set(customerId, {
            salesHistory: [],
            totalSpend: 0,
            visitCount: 0,
            favoriteItemCounts: new Map()
        });

        const normalizedName = String(customer.name || '').trim().toLowerCase();
        if (!normalizedName) return;

        if (!uniqueNameToId.has(normalizedName)) {
            uniqueNameToId.set(normalizedName, customerId);
        } else {
            uniqueNameToId.set(normalizedName, '');
        }
    });

    sales.forEach((sale) => {
        let customerId = String(sale.customerId || '').trim();
        if (!customerId) {
            const nameMatch = uniqueNameToId.get(String(sale.customerName || '').trim().toLowerCase());
            if (nameMatch) {
                customerId = nameMatch;
            }
        }

        if (!customerId || !activityById.has(customerId)) return;

        const activity = activityById.get(customerId);
        const normalizedItems = Array.isArray(sale.items)
            ? sale.items.map((item) => ({
                itemName: item.itemName || item.name || item.itemClass || 'Item',
                quantity: Number(item.quantity || 0) || 1,
                totalPrice: Number(item.totalPrice || item.total || 0) || 0
            }))
            : [];

        normalizedItems.forEach((item) => {
            activity.favoriteItemCounts.set(
                item.itemName,
                (activity.favoriteItemCounts.get(item.itemName) || 0) + item.quantity
            );
        });

        const itemsCount = Number(sale.itemsCount || normalizedItems.reduce((sum, item) => sum + item.quantity, 0)) || 0;
        const totalAmount = Number(sale.totalAmount || 0) || 0;
        const saleDateTime = parseDateValue(sale.saleDate, sale.saleTime);

        activity.salesHistory.push({
            id: String(sale.id || sale._id || '').trim(),
            saleDate: sale.saleDate || '',
            saleTime: sale.saleTime || '',
            sortTime: saleDateTime ? saleDateTime.getTime() : 0,
            totalAmount,
            itemsCount,
            employeeId: sale.employeeId || '',
            itemSummary: normalizedItems.map((item) => `${item.quantity}x ${item.itemName}`).join(', ') || 'No items recorded'
        });
        activity.totalSpend += totalAmount;
    });

    customerSalesById = new Map();

    return customers.map((customer) => {
        const customerId = String(customer.id || '').trim();
        const activity = activityById.get(customerId) || {
            salesHistory: [],
            totalSpend: 0,
            visitCount: 0,
            favoriteItemCounts: new Map()
        };

        activity.salesHistory.sort((left, right) => right.sortTime - left.sortTime);
        const visitCount = activity.salesHistory.length;
        const latestSale = activity.salesHistory[0] || null;
        const favoriteItem = [...activity.favoriteItemCounts.entries()]
            .sort((left, right) => right[1] - left[1])[0]?.[0] || '';

        const profile = {
            ...customer,
            salesHistory: activity.salesHistory,
            totalSpend: activity.totalSpend,
            visitCount,
            averageSpend: visitCount ? activity.totalSpend / visitCount : 0,
            favoriteItem,
            lastVisit: latestSale?.saleDate || customer.lastVisit || '',
            lastSaleTime: latestSale?.saleTime || '',
            isNewCustomer: visitCount === 0
        };

        customerSalesById.set(customerId, activity.salesHistory);
        return profile;
    });
}

// ===== Load and Render =====
async function loadCustomers() {
    try {
        const [customers, sales] = await Promise.all([
            getAllCustomers(),
            getAllSales().catch(() => [])
        ]);

        allCustomers = buildCustomerProfiles(customers, sales);
        renderCustomers(allCustomers);
        updateStats(allCustomers);
    } catch (error) {
        console.error('Failed to load customers:', error);
        document.getElementById('customersGrid').innerHTML = `
            <div class="col-span-full text-center py-20 text-slate-500 italic">
                Failed to load customers. Please try again.
            </div>
        `;
    }
}

function updateStats(customers) {
    document.getElementById('statTotal').textContent = customers.length;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const active = customers.filter(c => (c.lastVisit || '').startsWith(thisMonth));
    document.getElementById('statActive').textContent = active.length;
    const totalPoints = customers.reduce((s, c) => s + (c.loyaltyPoints || 0), 0);
    document.getElementById('statPoints').textContent = totalPoints.toLocaleString();
    const platinum = customers.filter(c => (c.loyaltyPoints || 0) >= 5000);
    document.getElementById('statPlatinum').textContent = platinum.length;
}

function renderCustomers(customers) {
    const grid = document.getElementById('customersGrid');
    if (customers.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-20">
            <span class="text-6xl block mb-3">👥</span>
            <p class="text-slate-400 font-semibold">No customers yet</p>
            <p class="text-xs text-slate-600 mt-1">Click "Add Customer" to add your first customer</p>
        </div>`;
        return;
    }

    grid.textContent = '';  // Clear safely
    
    customers.forEach(c => {
        const tier = getTier(c.loyaltyPoints);
        const { progress, nextTier, pointsToNextTier } = getTierProgress(c.loyaltyPoints);
        const initials = (c.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const customerId = String(c.id || '');

        // Create main card element
        const card = document.createElement('div');
        card.className = 'customer-card';
        card.addEventListener('click', () => openDetail(customerId));

        // Create photo element with URL validation
        const photoDiv = document.createElement('div');
        photoDiv.className = 'flex items-center gap-3 mb-3';

        if (c.photo) {
            const img = document.createElement('img');
            img.className = 'customer-avatar';
            img.alt = String(c.name || 'Customer');
            
            // Validate photo URL
            try {
                const photoUrl = new URL(c.photo, window.location.origin);
                // Only allow https, same origin, or data URLs
                if (photoUrl.protocol === 'https:' || photoUrl.origin === window.location.origin || c.photo.startsWith('data:')) {
                    img.src = photoUrl.href;
                } else {
                    img.style.display = 'none';  // Skip untrusted URL
                }
            } catch (e) {
                img.style.display = 'none';  // Invalid URL
            }
            photoDiv.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'customer-avatar-placeholder';
            const initialsSpan = document.createElement('span');
            initialsSpan.className = 'text-primary font-bold text-lg';
            initialsSpan.textContent = initials;  // Safe: text only
            placeholder.appendChild(initialsSpan);
            photoDiv.appendChild(placeholder);
        }

        // Create info section
        const infoDiv = document.createElement('div');
        infoDiv.className = 'flex-1 min-w-0';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'flex items-center gap-2 mb-0.5';

        const nameP = document.createElement('p');
        nameP.className = 'font-bold text-white text-sm truncate';
        nameP.textContent = c.name || 'Unknown';  // Safe: text only

        const tierBadge = document.createElement('span');
        tierBadge.className = `tier-badge ${tier.class}`;
        tierBadge.textContent = tier.name;

        headerDiv.appendChild(nameP);
        headerDiv.appendChild(tierBadge);

        const phoneP = document.createElement('p');
        phoneP.className = 'text-xs text-slate-400 truncate';
        phoneP.textContent = c.phone || '—';  // Safe: text only

        infoDiv.appendChild(headerDiv);
        infoDiv.appendChild(phoneP);
        photoDiv.appendChild(infoDiv);

        // Create loyalty points section
        const loyaltyDiv = document.createElement('div');
        loyaltyDiv.className = 'bg-slate-900/50 rounded-lg p-3 mb-3 border border-slate-700/30';

        const loyaltyHeaderDiv = document.createElement('div');
        loyaltyHeaderDiv.className = 'flex justify-between items-center mb-1';

        const loyaltyLabel = document.createElement('span');
        loyaltyLabel.className = 'text-xs text-slate-400 font-semibold';
        loyaltyLabel.textContent = 'Loyalty Points';

        const loyaltyPoints = document.createElement('span');
        loyaltyPoints.className = 'text-sm font-black';
        loyaltyPoints.style.color = tier.color;
        loyaltyPoints.textContent = `${(c.loyaltyPoints || 0).toLocaleString()} pts`;

        loyaltyHeaderDiv.appendChild(loyaltyLabel);
        loyaltyHeaderDiv.appendChild(loyaltyPoints);

        const loyaltyBar = document.createElement('div');
        loyaltyBar.className = 'loyalty-bar';
        const loyaltyFill = document.createElement('div');
        loyaltyFill.className = 'loyalty-fill';
        loyaltyFill.style.width = `${progress}%`;
        loyaltyBar.appendChild(loyaltyFill);

        const loyaltyNote = document.createElement('p');
        loyaltyNote.className = 'text-right text-[10px] mt-0.5';
        if (nextTier) {
            loyaltyNote.className += ' text-slate-500';
            loyaltyNote.textContent = `${pointsToNextTier} pts to ${nextTier.name}`;
        } else {
            loyaltyNote.className += ' text-purple-400';
            loyaltyNote.textContent = 'Top loyalty tier reached';
        }

        loyaltyDiv.appendChild(loyaltyHeaderDiv);
        loyaltyDiv.appendChild(loyaltyBar);
        loyaltyDiv.appendChild(loyaltyNote);

        // Create footer section
        const footerDiv = document.createElement('div');
        footerDiv.className = 'flex items-end justify-between gap-3 text-xs text-slate-500';

        const activityDiv = document.createElement('div');
        activityDiv.className = 'min-w-0';

        const favoriteP = document.createElement('p');
        favoriteP.className = 'truncate';
        if (c.favoriteItem) {
            favoriteP.textContent = `Favorite: ${c.favoriteItem}`;
        } else {
            favoriteP.textContent = 'No purchase history yet';
        }

        const lastVisitP = document.createElement('p');
        if (c.lastVisit) {
            lastVisitP.textContent = `Last visit ${formatDateDisplay(c.lastVisit)}`;
        } else {
            lastVisitP.textContent = 'New customer';
        }

        activityDiv.appendChild(favoriteP);
        activityDiv.appendChild(lastVisitP);

        const profileBtn = document.createElement('button');
        profileBtn.type = 'button';
        profileBtn.className = 'shrink-0 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors';
        profileBtn.textContent = 'Go to Profile';
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDetail(customerId);
        });

        footerDiv.appendChild(activityDiv);
        footerDiv.appendChild(profileBtn);

        // Assemble all parts
        card.appendChild(photoDiv);
        card.appendChild(loyaltyDiv);
        card.appendChild(footerDiv);
        grid.appendChild(card);
    });
}

// ===== Photo Handling =====
function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        currentPhotoDataUrl = e.target.result;
        const preview = document.getElementById('photoPreview');
        const placeholder = document.getElementById('photoPlaceholder');
        preview.src = currentPhotoDataUrl;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        document.getElementById('removePhotoBtn').classList.remove('hidden');
        document.getElementById('removePhotoBtn').style.display = 'flex';
    };
    reader.readAsDataURL(file);
}

function removePhoto() {
    currentPhotoDataUrl = null;
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('photoPlaceholder').style.display = 'flex';
    document.getElementById('removePhotoBtn').style.display = 'none';
    document.getElementById('photoInput').value = '';
}

// ===== Modal: Add / Edit =====
function openModal(customerId = null) {
    editingCustomerId = customerId;
    currentPhotoDataUrl = null;
    removePhoto();

    const modal = document.getElementById('customerModal');
    document.getElementById('modalTitle').innerHTML =
        `<span class="material-symbols-outlined text-primary">${customerId ? 'edit' : 'person_add'}</span> ${customerId ? 'Edit Customer' : 'Add New Customer'}`;
    document.getElementById('saveModalLabel').textContent = customerId ? 'Update Customer' : 'Save Customer';

    if (customerId) {
        const c = allCustomers.find(x => x.id === customerId);
        if (c) {
            document.getElementById('custName').value = c.name || '';
            document.getElementById('custPhone').value = c.phone || '';
            document.getElementById('custEmail').value = c.email || '';
            document.getElementById('custAddress').value = c.address || '';
            document.getElementById('custBirthday').value = c.birthday || '';
            document.getElementById('custPoints').value = c.loyaltyPoints || 0;
            document.getElementById('custNotes').value = c.notes || '';
            if (c.photo) {
                currentPhotoDataUrl = c.photo;
                document.getElementById('photoPreview').src = c.photo;
                document.getElementById('photoPreview').style.display = 'block';
                document.getElementById('photoPlaceholder').style.display = 'none';
                document.getElementById('removePhotoBtn').style.display = 'flex';
            }
        }
    } else {
        ['custName','custPhone','custEmail','custAddress','custNotes'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('custBirthday').value = '';
        document.getElementById('custPoints').value = 0;
    }

    modal.classList.add('active');
    setTimeout(() => document.getElementById('custName').focus(), 150);
}

function closeModal() {
    document.getElementById('customerModal').classList.remove('active');
    editingCustomerId = null;
}

async function saveCustomerForm() {
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    if (!name) { alert('Please enter a customer name.'); return; }
    if (!phone) { alert('Please enter a phone number.'); return; }

    const customerData = {
        name,
        phone,
        email: document.getElementById('custEmail').value.trim(),
        address: document.getElementById('custAddress').value.trim(),
        birthday: document.getElementById('custBirthday').value,
        loyaltyPoints: parseInt(document.getElementById('custPoints').value) || 0,
        notes: document.getElementById('custNotes').value.trim(),
        photo: currentPhotoDataUrl || null,
        createdAt: editingCustomerId ? undefined : new Date().toISOString()
    };

    if (editingCustomerId) {
        customerData.id = editingCustomerId;
        const existing = allCustomers.find(c => c.id === editingCustomerId);
        if (existing) {
            customerData.createdAt = existing.createdAt;
            customerData.lastVisit = existing.lastVisit || '';
            customerData._id = existing._id;
        }
    }

    try {
        await saveCustomer(customerData);
        closeModal();
        await loadCustomers();
    } catch (err) {
        if (err.name === 'ConstraintError') {
            alert('A customer with this phone number already exists.');
        } else {
            alert('Failed to save customer: ' + err.message);
        }
    }
}

// ===== Detail Modal =====
function openDetail(id) {
    detailCustomerId = id;
    const c = allCustomers.find(x => x.id === id);
    if (!c) return;
    const tier = getTier(c.loyaltyPoints);
    const { progress, nextTier, pointsToNextTier } = getTierProgress(c.loyaltyPoints);
    const initials = (c.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const photoHtml = c.photo
        ? `<img src="${c.photo}" class="w-20 h-20 rounded-full object-cover border-4 border-primary/30 mx-auto block mb-3" />`
        : `<div class="w-20 h-20 rounded-full bg-primary/20 border-4 border-primary/30 flex items-center justify-center mx-auto mb-3"><span class="text-primary font-black text-2xl">${initials}</span></div>`;

    const recentSalesHtml = c.salesHistory.length
        ? c.salesHistory.slice(0, 6).map((sale) => `
            <div class="sale-entry">
                <div class="flex items-start justify-between gap-3 mb-2">
                    <div>
                        <p class="text-sm font-bold text-white">${getSaleReference(sale.id)}</p>
                        <p class="text-[11px] text-slate-400">${sale.saleDate ? formatDateDisplay(sale.saleDate) : 'Unknown date'}${sale.saleTime ? ` at ${sale.saleTime.slice(0, 5)}` : ''}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-black text-emerald-400">${formatCurrency(sale.totalAmount)}</p>
                        <p class="text-[11px] text-slate-500">${sale.itemsCount} item${sale.itemsCount === 1 ? '' : 's'}</p>
                    </div>
                </div>
                <p class="text-xs text-slate-300">${escHtml(sale.itemSummary)}</p>
            </div>
        `).join('')
        : `<div class="sale-entry text-sm text-slate-400">No purchase history yet. Their first sale will show up here.</div>`;

    document.getElementById('detailContent').innerHTML = `
        <div class="grid lg:grid-cols-[320px,1fr] gap-4">
            <div class="space-y-4">
                <div class="profile-section text-center">
                    ${photoHtml}
                    <h3 class="text-2xl font-black text-white">${escHtml(c.name)}</h3>
                    <div class="flex items-center justify-center gap-2 mt-2">
                        <span class="tier-badge ${tier.class}">${tier.name} Member</span>
                        <span class="text-xs text-slate-400">${c.isNewCustomer ? 'New customer' : `${c.visitCount} visit${c.visitCount === 1 ? '' : 's'}`}</span>
                    </div>
                    <p class="text-sm text-slate-400 mt-3">${escHtml(c.phone || 'No phone number')}</p>
                    <p class="text-sm text-slate-500">${escHtml(c.email || 'No email address')}</p>
                </div>

                <div class="profile-section">
                    <div class="flex items-center justify-between mb-2">
                        <p class="text-xs text-slate-400 uppercase font-bold tracking-wider">Loyalty Status</p>
                        <p class="text-lg font-black" style="color:${tier.color}">${(c.loyaltyPoints || 0).toLocaleString()} pts</p>
                    </div>
                    <div class="loyalty-bar mb-2">
                        <div class="loyalty-fill" style="width:${progress}%"></div>
                    </div>
                    <p class="text-xs text-slate-400">${nextTier ? `${pointsToNextTier} more points to reach ${nextTier.name}` : 'Top loyalty tier reached.'}</p>
                </div>

                <div class="profile-section">
                    <p class="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">Customer Details</p>
                    <div class="space-y-3 text-sm">
                        <div>
                            <p class="text-slate-500 text-xs uppercase tracking-wider">Address</p>
                            <p class="text-white font-medium">${escHtml(c.address || 'Not added yet')}</p>
                        </div>
                        <div>
                            <p class="text-slate-500 text-xs uppercase tracking-wider">Birthday</p>
                            <p class="text-white font-medium">${c.birthday ? formatDateDisplay(c.birthday) : 'Not added yet'}</p>
                        </div>
                        <div>
                            <p class="text-slate-500 text-xs uppercase tracking-wider">Member Since</p>
                            <p class="text-white font-medium">${c.createdAt ? formatDateDisplay(c.createdAt) : 'Unknown'}</p>
                        </div>
                        <div>
                            <p class="text-slate-500 text-xs uppercase tracking-wider">Favorite Item</p>
                            <p class="text-white font-medium">${escHtml(c.favoriteItem || 'No purchase history yet')}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="space-y-4">
                <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div class="profile-stat">
                        <p class="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">Lifetime Spend</p>
                        <p class="text-xl font-black text-emerald-400">${formatCurrency(c.totalSpend)}</p>
                    </div>
                    <div class="profile-stat">
                        <p class="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">Purchases</p>
                        <p class="text-xl font-black text-white">${c.visitCount}</p>
                    </div>
                    <div class="profile-stat">
                        <p class="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">Average Basket</p>
                        <p class="text-xl font-black text-amber-400">${formatCurrency(c.averageSpend)}</p>
                    </div>
                    <div class="profile-stat">
                        <p class="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">Last Visit</p>
                        <p class="text-sm font-bold text-white">${c.lastVisit ? formatDateDisplay(c.lastVisit) : 'No visits yet'}</p>
                    </div>
                </div>

                <div class="profile-section">
                    <div class="flex items-center justify-between mb-3">
                        <p class="text-xs text-slate-400 uppercase font-bold tracking-wider">Recent Purchase History</p>
                        <p class="text-xs text-slate-500">${c.salesHistory.length} recorded sale${c.salesHistory.length === 1 ? '' : 's'}</p>
                    </div>
                    <div class="space-y-3">
                        ${recentSalesHtml}
                    </div>
                </div>

                <div class="profile-section">
                    <p class="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">Notes</p>
                    <p class="text-sm text-slate-200 leading-6">${escHtml(c.notes || 'No notes saved for this customer yet.')}</p>
                </div>
            </div>
        </div>
    `;
    document.getElementById('detailModal').classList.add('active');
}

function closeDetailModal() { document.getElementById('detailModal').classList.remove('active'); detailCustomerId = null; }
function editFromDetail() { closeDetailModal(); openModal(detailCustomerId); }
async function deleteFromDetail() {
    const c = allCustomers.find(x => x.id === detailCustomerId);
    if (!c) return;
    if (!confirm(`Delete customer "${c.name}"? This cannot be undone.`)) return;
    try {
        await deleteCustomer(detailCustomerId);
        closeDetailModal();
        await loadCustomers();
    } catch (error) {
        alert(`Failed to delete customer: ${error.message}`);
    }
}

// ===== Search =====
document.getElementById('searchInput').addEventListener('input', function() {
    const q = this.value.toLowerCase().trim();
    if (!q) { renderCustomers(allCustomers); return; }
    const filtered = allCustomers.filter(c =>
        (c.name||'').toLowerCase().includes(q) ||
        (c.phone||'').includes(q) ||
        (c.email||'').toLowerCase().includes(q) ||
        (c.notes||'').toLowerCase().includes(q)
    );
    renderCustomers(filtered);
});

function escHtml(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}

// ===== Init =====
initDatabase().then(() => loadCustomers());
