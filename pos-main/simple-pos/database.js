// MongoDB API Wrapper for POS V2
// This file replaces local IndexedDB with centralized Node.js/MongoDB operations.
// Includes JWT authentication support for all API calls.

const DEFAULT_API_ORIGIN = 'http://localhost:5000';
const API_ORIGIN_KEY = 'pos_api_origin';
const AUTH_TOKEN_KEY = 'pos_auth_token';
const AUTH_USER_KEY = 'pos_auth_user';
const LOCAL_API_CANDIDATES = [
    'http://127.0.0.1:5096',
    'http://localhost:5096',
    'http://127.0.0.1:5000',
    'http://localhost:5000'
];
const API_HEALTHCHECK_PATH = '/api/health';
const API_PROBE_TIMEOUT_MS = 2500;
const SALES_SYNC_EVENT_KEY = 'pos_last_sale_event';
const SALES_SYNC_CHANNEL = 'fashion-shaa-pos-sync';
const WINDOW_NAME_STORAGE_PREFIX = '__fashion_shaa_pos_storage__=';
const BUSINESS_TIME_ZONE = 'Asia/Colombo';
let resolvedApiOriginPromise = null;
let resolvedStorageBackend = null;
const inMemoryStorage = Object.create(null);

function getDateTimeFormatterParts(formatter, date = new Date()) {
    const values = {};
    for (const part of formatter.formatToParts(date)) {
        if (part.type !== 'literal') {
            values[part.type] = part.value;
        }
    }
    return values;
}

function formatBusinessDate(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = getDateTimeFormatterParts(formatter, date);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatBusinessTime(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: BUSINESS_TIME_ZONE,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const parts = getDateTimeFormatterParts(formatter, date);
    return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function getBrowserStorage(type) {
    try {
        return typeof window !== 'undefined' ? window[type] : null;
    } catch {
        return null;
    }
}

function canUseBrowserStorage(type) {
    const storage = getBrowserStorage(type);
    if (!storage) return false;

    try {
        const probeKey = '__fashion_shaa_storage_probe__';
        storage.setItem(probeKey, '1');
        storage.removeItem(probeKey);
        return true;
    } catch {
        return false;
    }
}

function readWindowNameStorage() {
    if (typeof window === 'undefined') return {};

    try {
        const rawWindowName = String(window.name || '');
        const prefixIndex = rawWindowName.indexOf(WINDOW_NAME_STORAGE_PREFIX);
        if (prefixIndex === -1) return {};

        const payload = rawWindowName.slice(prefixIndex + WINDOW_NAME_STORAGE_PREFIX.length);
        const parsed = JSON.parse(payload);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeWindowNameStorage(store) {
    if (typeof window === 'undefined') return false;

    try {
        const rawWindowName = String(window.name || '');
        const prefixIndex = rawWindowName.indexOf(WINDOW_NAME_STORAGE_PREFIX);
        const preservedPrefix = prefixIndex === -1 ? rawWindowName : rawWindowName.slice(0, prefixIndex);
        window.name = `${preservedPrefix}${WINDOW_NAME_STORAGE_PREFIX}${JSON.stringify(store)}`;
        return true;
    } catch {
        return false;
    }
}

function detectStorageBackend() {
    if (canUseBrowserStorage('localStorage')) return 'localStorage';
    if (canUseBrowserStorage('sessionStorage')) return 'sessionStorage';
    if (typeof window !== 'undefined') return 'windowName';
    return 'memory';
}

function getStorageBackend() {
    if (!resolvedStorageBackend) {
        resolvedStorageBackend = detectStorageBackend();
    }
    return resolvedStorageBackend;
}

function resetStorageBackend() {
    resolvedStorageBackend = null;
}

const safeStorage = {
    getItem(key) {
        const normalizedKey = String(key);
        const backend = getStorageBackend();

        try {
            if (backend === 'windowName') {
                const store = readWindowNameStorage();
                return Object.prototype.hasOwnProperty.call(store, normalizedKey) ? store[normalizedKey] : null;
            }

            if (backend === 'memory') {
                return Object.prototype.hasOwnProperty.call(inMemoryStorage, normalizedKey) ? inMemoryStorage[normalizedKey] : null;
            }

            const storage = getBrowserStorage(backend);
            return storage ? storage.getItem(normalizedKey) : null;
        } catch {
            resetStorageBackend();
            if (backend === 'memory') return null;
            return safeStorage.getItem(normalizedKey);
        }
    },

    setItem(key, value) {
        const normalizedKey = String(key);
        const normalizedValue = String(value);
        const backend = getStorageBackend();

        try {
            if (backend === 'windowName') {
                const store = readWindowNameStorage();
                store[normalizedKey] = normalizedValue;
                return writeWindowNameStorage(store);
            }

            if (backend === 'memory') {
                inMemoryStorage[normalizedKey] = normalizedValue;
                return true;
            }

            const storage = getBrowserStorage(backend);
            if (!storage) return false;
            storage.setItem(normalizedKey, normalizedValue);
            return true;
        } catch {
            resetStorageBackend();
            if (backend === 'memory') return false;
            return safeStorage.setItem(normalizedKey, normalizedValue);
        }
    },

    removeItem(key) {
        const normalizedKey = String(key);
        const backend = getStorageBackend();

        try {
            if (backend === 'windowName') {
                const store = readWindowNameStorage();
                delete store[normalizedKey];
                return writeWindowNameStorage(store);
            }

            if (backend === 'memory') {
                delete inMemoryStorage[normalizedKey];
                return true;
            }

            const storage = getBrowserStorage(backend);
            if (!storage) return false;
            storage.removeItem(normalizedKey);
            return true;
        } catch {
            resetStorageBackend();
            if (backend === 'memory') return false;
            return safeStorage.removeItem(normalizedKey);
        }
    }
};

// ============================================
// API Origin Management
// ============================================

function isLoopbackHost(host) {
    return host === 'localhost' || host === '127.0.0.1';
}

function normalizeApiOrigin(origin) {
    let v = String(origin || '').trim();
    if (!v) return DEFAULT_API_ORIGIN;

    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v)) {
        v = `http://${v}`;
    }

    let url;
    try {
        url = new URL(v);
    } catch {
        throw new Error('Invalid API origin. Example: http://localhost:5000 or https://your-service.onrender.com');
    }

    const host = url.hostname;
    const isLoopback = isLoopbackHost(host);
    const isHttps = url.protocol === 'https:';
    const isLoopbackHttp = isLoopback && url.protocol === 'http:';

    if (!isHttps && !isLoopbackHttp) {
        throw new Error('Use http://localhost for local APIs or https:// for hosted APIs');
    }

    if (url.port) {
        const port = Number(url.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('Invalid API port');
        }
    }

    if (isLoopback && !url.port) {
        return `${url.protocol}//${host}:5000`;
    }

    if (url.username || url.password) {
        throw new Error('API origin must not include credentials');
    }

    if (!isLoopback && !isHttps) {
        throw new Error('Invalid API port');
    }

    return url.origin;
}

function getApiOrigin() {
    try {
        const saved = safeStorage.getItem(API_ORIGIN_KEY);
        return normalizeApiOrigin(saved);
    } catch {
        return DEFAULT_API_ORIGIN;
    }
}

function setApiOrigin(origin) {
    const normalized = normalizeApiOrigin(origin);
    safeStorage.setItem(API_ORIGIN_KEY, normalized);
    return normalized;
}

function getApiBase() {
    return `${getApiOrigin()}/api`;
}

function getSavedApiOrigin() {
    try {
        const saved = safeStorage.getItem(API_ORIGIN_KEY);
        return saved ? normalizeApiOrigin(saved) : '';
    } catch {
        return '';
    }
}

function isLoopbackOrigin(origin) {
    try {
        return isLoopbackHost(new URL(origin).hostname);
    } catch {
        return false;
    }
}

function pushApiCandidate(list, origin) {
    if (!origin) return;

    try {
        const normalized = normalizeApiOrigin(origin);
        if (!list.includes(normalized)) {
            list.push(normalized);
        }
    } catch {
        // Ignore invalid candidates.
    }
}

function getPreferredFallbackApiOrigin(candidates, savedOrigin, defaultOrigin) {
    const firstLoopbackCandidate = candidates.find((candidate) => isLoopbackOrigin(candidate));
    if (firstLoopbackCandidate) return firstLoopbackCandidate;
    return savedOrigin || defaultOrigin;
}

async function probeApiOrigin(origin) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_PROBE_TIMEOUT_MS);

    try {
        const response = await fetch(`${origin}${API_HEALTHCHECK_PATH}`, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal
        });

        return response.ok;
    } catch {
        return false;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

async function resolveApiOrigin({ forceRefresh = false } = {}) {
    if (!forceRefresh && resolvedApiOriginPromise) {
        return resolvedApiOriginPromise;
    }

    resolvedApiOriginPromise = (async () => {
        const savedOrigin = getSavedApiOrigin();
        const defaultOrigin = normalizeApiOrigin(DEFAULT_API_ORIGIN);
        const candidates = [];

        pushApiCandidate(candidates, savedOrigin);
        pushApiCandidate(candidates, defaultOrigin);
        LOCAL_API_CANDIDATES.forEach((candidate) => pushApiCandidate(candidates, candidate));

        for (const candidate of candidates) {
            if (await probeApiOrigin(candidate)) {
                try {
                    if (savedOrigin !== candidate) {
                        safeStorage.setItem(API_ORIGIN_KEY, candidate);
                    }
                } catch {
                    // Ignore storage errors and continue with the resolved candidate.
                }
                return candidate;
            }
        }

        return getPreferredFallbackApiOrigin(candidates, savedOrigin, defaultOrigin);
    })();

    return resolvedApiOriginPromise;
}

function isNetworkFetchError(error) {
    if (!error) return false;

    const message = String(error.message || error || '').toLowerCase();
    return error.name === 'TypeError'
        || message.includes('failed to fetch')
        || message.includes('networkerror')
        || message.includes('load failed');
}

async function fetchJsonFromApi(apiOrigin, endpoint, options = {}) {
    const response = await fetch(`${apiOrigin}/api${endpoint}`, options);
    const data = await response.json().catch(() => ({}));
    return { response, data };
}

async function retryWithFreshApiOrigin(requestFn, initialOrigin) {
    const refreshedOrigin = await resolveApiOrigin({ forceRefresh: true });
    if (refreshedOrigin === initialOrigin) {
        return null;
    }
    return requestFn(refreshedOrigin);
}

function getSaleRecordId(sale) {
    if (!sale || typeof sale !== 'object') return '';
    const rawId = sale._id || sale.id;
    return rawId == null ? '' : String(rawId).trim();
}

function getSaleReceiptId(sale) {
    if (!sale || typeof sale !== 'object') return '';
    const provided = String(sale.receiptId || '').trim();
    if (provided) return provided;

    const recordId = getSaleRecordId(sale);
    return recordId ? `SALE-${recordId.slice(-6).toUpperCase()}` : '';
}

function notifySaleRecorded(sale) {
    if (typeof window === 'undefined') return;

    const payload = {
        type: 'sale-recorded',
        at: Date.now(),
        sale: {
            id: sale?._id || sale?.id || null,
            saleDate: sale?.saleDate || '',
            saleTime: sale?.saleTime || '',
            totalAmount: Number(sale?.totalAmount || 0) || 0
        }
    };

    try {
        safeStorage.setItem(SALES_SYNC_EVENT_KEY, JSON.stringify(payload));
    } catch {
        // Ignore storage errors and continue with best-effort realtime sync.
    }

    try {
        if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel(SALES_SYNC_CHANNEL);
            channel.postMessage(payload);
            channel.close();
        }
    } catch {
        // Ignore broadcast errors — analytics still has focus/poll refreshes.
    }
}

function normalizeSaleLookupValue(value) {
    return String(value || '')
        .trim()
        .replace(/^#/, '')
        .toUpperCase();
}

function matchesSaleReference(sale, reference) {
    const normalizedReference = normalizeSaleLookupValue(reference);
    if (!normalizedReference) return false;

    const recordId = getSaleRecordId(sale).toUpperCase();
    const receiptId = getSaleReceiptId(sale).toUpperCase();

    if (recordId && recordId === normalizedReference) return true;
    if (receiptId && receiptId === normalizedReference) return true;

    if (receiptId && !normalizedReference.startsWith('SALE-')) {
        return receiptId.endsWith(normalizedReference);
    }

    return false;
}

if (typeof window !== 'undefined') {
    window.POS_API = window.POS_API || {};
    Object.assign(window.POS_API, {
        normalizeApiOrigin,
        getApiOrigin,
        setApiOrigin,
        getApiBase,
        resolveApiOrigin,
        storage: safeStorage,
        BUSINESS_TIME_ZONE,
        formatBusinessDate,
        formatBusinessTime,
        SALES_SYNC_EVENT_KEY,
        SALES_SYNC_CHANNEL,
        getSaleRecordId,
        getSaleReceiptId,
        normalizeSaleLookupValue,
        matchesSaleReference
    });
}

// ============================================
// JWT Authentication Functions
// ============================================

function getAuthToken() {
    return safeStorage.getItem(AUTH_TOKEN_KEY);
}

function setAuthToken(token) {
    safeStorage.setItem(AUTH_TOKEN_KEY, token);
}

function getAuthUser() {
    try {
        const raw = safeStorage.getItem(AUTH_USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function setAuthUser(user) {
    safeStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function isAuthenticated() {
    const token = getAuthToken();
    if (!token) return false;
    // Check token expiry (JWT payload is base64)
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 > Date.now();
    } catch {
        return false;
    }
}

async function loginUser(username, password) {
    const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        cache: 'no-store'
    };

    const runLogin = async (apiOrigin) => {
        const { response, data } = await fetchJsonFromApi(apiOrigin, '/auth/login', requestOptions);
        if (!response.ok) throw new Error(data.error || 'Login failed');
        setAuthToken(data.token);
        setAuthUser(data.user);
        return data;
    };

    const apiOrigin = await resolveApiOrigin();

    try {
        return await runLogin(apiOrigin);
    } catch (error) {
        if (!isNetworkFetchError(error)) {
            throw error;
        }

        const retried = await retryWithFreshApiOrigin(runLogin, apiOrigin);
        if (retried) {
            return retried;
        }

        throw new Error('Could not reach the POS server. Please make sure the local backend is running.');
    }
}

async function registerUser(username, password, role = 'cashier', employeeId = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const requestOptions = {
        method: 'POST',
        headers,
        body: JSON.stringify({ username, password, role, employeeId }),
        cache: 'no-store'
    };

    const runRegistration = async (apiOrigin) => {
        const { response, data } = await fetchJsonFromApi(apiOrigin, '/auth/register', requestOptions);
        if (!response.ok) throw new Error(data.error || 'Registration failed');
        setAuthToken(data.token);
        setAuthUser(data.user);
        return data;
    };

    const apiOrigin = await resolveApiOrigin();

    try {
        return await runRegistration(apiOrigin);
    } catch (error) {
        if (!isNetworkFetchError(error)) {
            throw error;
        }

        const retried = await retryWithFreshApiOrigin(runRegistration, apiOrigin);
        if (retried) {
            return retried;
        }

        throw new Error('Could not reach the POS server. Please make sure the local backend is running.');
    }
}

function logoutUser() {
    safeStorage.removeItem(AUTH_TOKEN_KEY);
    safeStorage.removeItem(AUTH_USER_KEY);
    // Redirect to login if a login page exists
    if (typeof showLoginScreen === 'function') {
        showLoginScreen();
        return;
    }

    if (typeof window !== 'undefined') {
        const targetUrl = new URL('index.html', window.location.href).href;

        if (window.top && window.top !== window) {
            window.top.location.replace(targetUrl);
            return;
        }

        if (!/\/index\.html(?:$|\?)/.test(window.location.pathname + window.location.search)) {
            window.location.replace(targetUrl);
        }
    }
}

function getSystemUsers() {
    return fetchAPI('/auth/users');
}

function createSystemUserAccount({ username, password, role = 'cashier', employeeId = null, pin = null }) {
    const body = { username, password, role };
    if (employeeId) body.employeeId = employeeId;
    if (pin) body.pin = pin;
    return fetchAPI('/auth/register', { method: 'POST', body });
}

function updateSystemUserAccount(userId, updates) {
    return fetchAPI(`/auth/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: updates
    });
}

// Expose auth functions globally
if (typeof window !== 'undefined') {
    Object.assign(window.POS_API, {
        getAuthToken, setAuthToken, getAuthUser, setAuthUser,
        isAuthenticated, loginUser, registerUser, logoutUser,
        getSystemUsers, createSystemUserAccount, updateSystemUserAccount,
        resolveApiOrigin
    });
}

// ============================================
// Fetch Wrapper — with JWT token injection
// ============================================

async function fetchAPI(endpoint, options = {}) {
    try {
        const requestOptions = { ...options };

        if (requestOptions.body && typeof requestOptions.body === 'object') {
            requestOptions.body = JSON.stringify(requestOptions.body);
            requestOptions.headers = { ...requestOptions.headers, 'Content-Type': 'application/json' };
        }

        // Inject JWT token into every request
        const token = getAuthToken();
        if (token) {
            requestOptions.headers = { ...requestOptions.headers, 'Authorization': `Bearer ${token}` };
        }

        requestOptions.headers = {
            Accept: 'application/json',
            ...requestOptions.headers
        };

        if (!requestOptions.cache) {
            requestOptions.cache = 'no-store';
        }

        const runRequest = async (apiOrigin) => {
            const { response, data } = await fetchJsonFromApi(apiOrigin, endpoint, requestOptions);

            if (response.status === 401) {
                console.warn('Auth expired:', data.error);
                logoutUser();
                throw new Error(data.error || 'Session expired. Please login again.');
            }

            if (!response.ok) {
                throw new Error(`API Error: ${data.error || response.statusText}`);
            }

            return data;
        };

        const apiOrigin = await resolveApiOrigin();

        try {
            return await runRequest(apiOrigin);
        } catch (error) {
            if (!isNetworkFetchError(error)) {
                throw error;
            }

            const retried = await retryWithFreshApiOrigin(runRequest, apiOrigin);
            if (retried) {
                return retried;
            }

            throw new Error('Could not reach the POS server. Please make sure the local backend is running.');
        }
    } catch (e) {
        console.error(`API Error on ${endpoint}:`, e);
        throw e;
    }
}

if (typeof window !== 'undefined') {
    Object.assign(window.POS_API, { fetchAPI });
}

let db = true; // Legacy compatibility flag for older POS checks
let databaseReadyPromise = null;

async function initDatabase() {
    const apiOrigin = await resolveApiOrigin();
    console.log(`MongoDB API connected via database.js wrapper. (${apiOrigin})`);
    return Promise.resolve();
}

function whenDatabaseReady() {
    if (!databaseReadyPromise) {
        databaseReadyPromise = initDatabase()
            .then(() => {
                db = true;
                if (typeof window !== 'undefined') {
                    window.db = true;
                    window.POS_API.databaseReady = true;
                    delete window.POS_API.databaseReadyError;
                }
                return true;
            })
            .catch((error) => {
                db = false;
                if (typeof window !== 'undefined') {
                    window.db = false;
                    window.POS_API.databaseReady = false;
                    window.POS_API.databaseReadyError = error?.message || String(error);
                }
                throw error;
            });
    }

    return databaseReadyPromise;
}

// ==========================================
// Sales & Items Functions
// ==========================================

async function saveSale(employeeId, totalAmount, amountReceived, changeAmount, items, discount = 0, customerId = null, customerName = null) {
    const now = new Date();
    const saleDate = formatBusinessDate(now);
    const saleTime = formatBusinessTime(now);

    const sale = {
        employeeId: employeeId.toString(),
        totalAmount: totalAmount,
        subTotal: totalAmount + discount,
        discount: discount,
        amountReceived: amountReceived,
        changeAmount: changeAmount,
        itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
        saleDate: saleDate,
        saleTime: saleTime,
        customerId: customerId ? customerId.toString() : null,
        customerName: customerName,
        items: items.map(item => ({
            sku: item.sku || null,
            itemName: item.name,
            category: item.category || null,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.total,
            discountEligible: item.discountEligible || false,
            priceFromBarcode: item.priceFromBarcode || false
        }))
    };

    const savedSale = await fetchAPI('/sales', { method: 'POST', body: sale });
    notifySaleRecorded(savedSale);
    return savedSale;
}

async function getAllSales(dateFilter) {
    const params = new URLSearchParams({ limit: '5000' });
    if (dateFilter) params.set('date', dateFilter);
    const endpoint = `/sales?${params.toString()}`;
    const result = await fetchAPI(endpoint);
    // Handle both paginated response { data: [...], pagination: {...} } and legacy flat array
    return Array.isArray(result) ? result : (result.data || []);
}

async function getAllSaleItems() {
    const sales = await getAllSales();
    return sales.flatMap(sale =>
        (sale.items || []).map(item => ({
            ...item,
            saleDate: sale.saleDate,
            employeeId: sale.employeeId
        }))
    );
}

async function getSaleItemsBySaleId(saleId) {
    const sales = await getAllSales();
    const sale = sales.find((entry) => String(entry._id || entry.id) === String(saleId));
    return sale ? (sale.items || []) : [];
}

async function getSalesByDateRange(startDate, endDate) {
    const sales = await getAllSales();
    return sales.filter(s => s.saleDate >= startDate && s.saleDate <= endDate);
}

async function updateSaleRecord(saleId, updates) {
    const updatedSale = await fetchAPI(`/sales/${encodeURIComponent(saleId)}`, {
        method: 'PUT',
        body: updates
    });
    notifySaleRecorded(updatedSale);
    return updatedSale;
}

async function getSalesByEmployee(employeeId) {
    const sales = await getAllSales();
    return sales.filter(s => s.employeeId === employeeId.toString());
}

// ==========================================
// Employee Functions
// ==========================================

function normalizeEmployeeRecord(employee) {
    if (!employee || typeof employee !== 'object') return null;

    const resolvedId = String(employee.id || employee.empId || '').trim();

    return {
        ...employee,
        id: resolvedId || null,
        empId: resolvedId || null,
        phone: employee.phone || '',
        role: employee.role || 'cashier',
        baseSalary: Number(employee.baseSalary || 0),
        workingDaysPerMonth: Math.max(1, Number(employee.workingDaysPerMonth || 26))
    };
}

function getAllEmployees() {
    return fetchAPI('/employees').then((employees) => (
        Array.isArray(employees)
            ? employees.map(normalizeEmployeeRecord).filter(Boolean)
            : []
    ));
}

function saveEmployee(id, name, phone, role, salary) {
    // If id starts with E, it already exists, else it might be number
    const formattedId = id.toString().startsWith('E') ? id : 'E' + id;
    const numericSalary = Number(salary?.baseSalary ?? salary ?? 0);
    const workingDaysPerMonth = Math.max(1, Number(salary?.workingDaysPerMonth ?? 26));
    return fetchAPI('/employees', {
        method: 'POST',
        body: {
            empId: formattedId,
            name,
            phone,
            role: role || 'cashier',
            baseSalary: Number.isFinite(numericSalary) ? numericSalary : 0,
            workingDaysPerMonth: Number.isFinite(workingDaysPerMonth) ? workingDaysPerMonth : 26
        }
    }).then(normalizeEmployeeRecord);
}
function updateEmployeeRecord(id, updateData) {
    const formattedId = id.toString().startsWith('E') ? id : 'E' + id;
    return fetchAPI(`/employees/${formattedId}`, {
        method: 'PUT',
        body: updateData
    }).then(normalizeEmployeeRecord);
}
function deleteEmployeeFromDB(id) { 
    return fetchAPI(`/employees/${id}`, { method: 'DELETE' }); 
}

function normalizeAttendanceRecord(record) {
    if (!record || typeof record !== 'object') return null;

    return {
        ...record,
        id: String(record.id || '').trim(),
        employeeId: String(record.employeeId || '').trim(),
        employeeName: record.employeeName || '',
        date: String(record.date || '').trim(),
        status: record.status || 'present',
        note: record.note || ''
    };
}

function getAllAttendance(filters = {}) {
    const params = new URLSearchParams();
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    if (filters.date) params.set('date', filters.date);
    if (filters.month) params.set('month', filters.month);

    const query = params.toString();
    return fetchAPI(`/attendance${query ? `?${query}` : ''}`).then((records) => (
        Array.isArray(records)
            ? records.map(normalizeAttendanceRecord).filter(Boolean)
            : []
    ));
}

function saveAttendanceRecord(record) {
    return fetchAPI('/attendance', {
        method: 'POST',
        body: record
    }).then(normalizeAttendanceRecord);
}

// ==========================================
// Inventory Items
// ==========================================

function inventorySkuFromId(id) {
    return `ITM-${id}`;
}

function getAllInventoryItems() { return fetchAPI('/items'); }
function getInventoryItem(sku) {
    if (!sku) return Promise.resolve(null);
    return fetchAPI(`/items/${encodeURIComponent(sku)}`);
}

async function saveInventoryItem(id, name, price = 0, stockLevel = 0, category = 'Other', storedAt = null, barcode = null, imageUrl = '') {
    const body = { sku: inventorySkuFromId(id), name: name, price: price, stockLevel: stockLevel, category: category };
    if (storedAt) body.storedAt = storedAt;
    if (barcode) body.barcode = barcode;
    if (imageUrl) body.imageUrl = imageUrl;
    return fetchAPI('/items', {
        method: 'POST',
        body
    });
}

function updateInventoryItem(sku, updateData) {
    return fetchAPI(`/items/${encodeURIComponent(sku)}`, { method: 'PUT', body: updateData });
}

function deleteInventoryItem(id) {
    return fetchAPI(`/items/${encodeURIComponent(inventorySkuFromId(id))}`, { method: 'DELETE' });
}
function deleteInventoryItemBySku(sku) {
    return fetchAPI(`/items/${encodeURIComponent(sku)}`, { method: 'DELETE' });
}

// ==========================================
// Barcode (generate/assign/render)
// ==========================================

function generateEan13Barcode(prefix = '2') {
    return fetchAPI('/barcode/generate', { method: 'POST', body: { format: 'ean13', prefix } });
}
function assignEan13BarcodeToItem(sku, prefix = '2') {
    return fetchAPI('/barcode/assign', { method: 'POST', body: { sku, format: 'ean13', prefix } });
}

function generateStructuredBarcode({ sku, category, price, storedAt }) {
    return fetchAPI('/barcode/generate', {
        method: 'POST',
        body: { format: 'structured', sku, category, price, storedAt }
    });
}
function assignStructuredBarcodeToItem(sku) {
    return fetchAPI('/barcode/assign', { method: 'POST', body: { sku, format: 'structured' } });
}

function renderBarcodePng(text, symbology = 'code128', scale = 3, height = 12, includetext = true) {
    return fetchAPI('/barcode/render', { method: 'POST', body: { text, symbology, scale, height, includetext } });
}

// ==========================================
// Reporting / Analytics
// ==========================================
// Note: We perform filtering client-side here to maintain API compatibility
function getTodaySales() {
    const today = formatBusinessDate(new Date());
    return getSalesByDateRange(today, today);
}
function getWeekSales() {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return getSalesByDateRange(formatBusinessDate(monday), formatBusinessDate(sunday));
}
function getYearSales() {
    const now = new Date();
    return getSalesByDateRange(`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`);
}

async function getEmployeeSales(employeeId, period = 'all') {
    if (employeeId == null || employeeId === '') {
        return [];
    }
    let allSales;
    switch (period) {
        case 'today': allSales = await getTodaySales(); break;
        case 'week': allSales = await getWeekSales(); break;
        case 'year': allSales = await getYearSales(); break;
        default: allSales = await getAllSales(); break;
    }
    const normalizedEmployeeId = String(employeeId);
    return allSales.filter(sale => String(sale.employeeId || '') === normalizedEmployeeId);
}
async function getEmployeeRevenue(employeeId, period = 'all') {
    const sales = await getEmployeeSales(employeeId, period);
    return sales.reduce((total, sale) => total + (sale.totalAmount || 0), 0);
}

// ==========================================
// CRM / Customers
// ==========================================

function normalizeCustomerRecord(customer) {
    if (!customer || typeof customer !== 'object') return null;

    return {
        ...customer,
        id: String(customer.id || customer._id || '').trim(),
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        address: customer.address || '',
        birthday: customer.birthday || '',
        loyaltyPoints: Number(customer.loyaltyPoints ?? customer.points ?? 0) || 0,
        points: Number(customer.points ?? customer.loyaltyPoints ?? 0) || 0,
        notes: customer.notes || '',
        photo: customer.photo || customer.photoBase64 || '',
        photoBase64: customer.photoBase64 || customer.photo || '',
        lastVisit: customer.lastVisit || '',
        createdAt: customer.createdAt || ''
    };
}

function serializeCustomerForApi(customer) {
    const normalized = normalizeCustomerRecord(customer);
    if (!normalized) return customer;

    return {
        ...customer,
        id: normalized.id || Date.now().toString(),
        name: normalized.name,
        phone: normalized.phone,
        email: normalized.email,
        address: normalized.address,
        birthday: normalized.birthday,
        points: normalized.loyaltyPoints,
        notes: normalized.notes,
        photoBase64: normalized.photo,
        lastVisit: normalized.lastVisit,
        createdAt: normalized.createdAt
    };
}

async function getAllCustomers() {
    const customers = await fetchAPI('/customers');
    return Array.isArray(customers)
        ? customers.map(normalizeCustomerRecord).filter(Boolean)
        : [];
}
async function getCustomerById(id) {
    const customer = await fetchAPI(`/customers/${id}`);
    return normalizeCustomerRecord(customer);
}
function saveCustomer(customer) {
    const serialized = serializeCustomerForApi(customer);
    if (!serialized.id) serialized.id = Date.now().toString(); // Auto-ID
    // if exists we should ideally PUT but mock backend lets us POST / catch code 11000 or write PUT
    if (serialized._id) return fetchAPI(`/customers/${serialized.id}`, { method: 'PUT', body: serialized });
    return fetchAPI('/customers', { method: 'POST', body: serialized });
}
function deleteCustomer(id) { return fetchAPI(`/customers/${id}`, { method: 'DELETE' }); }
async function addLoyaltyPoints(customerId, points) {
    const customer = await getCustomerById(customerId);
    if (!customer) return;
    customer.loyaltyPoints = (customer.loyaltyPoints || 0) + points;
    return fetchAPI(`/customers/${customerId}`, { method: 'PUT', body: customer });
}

// ==========================================
// Shifts
// ==========================================

function toShiftEmployeeId(employeeId) {
    const raw = String(employeeId || '').trim();
    if (!raw) return '';
    if (/^E/i.test(raw)) return `E${raw.slice(1).trim()}`;

    const digits = raw.match(/\d+/)?.[0];
    return digits ? `E${parseInt(digits, 10)}` : raw;
}

function toShiftDateTime(dateValue, timeValue) {
    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
        return dateValue.toISOString();
    }

    const dateString = String(dateValue || '').trim();
    const timeString = String(timeValue || '').trim();

    if (!dateString && !timeString) return null;

    const directDate = new Date(dateString);
    if (dateString && !Number.isNaN(directDate.getTime()) && (!timeString || dateString.includes('T'))) {
        return directDate.toISOString();
    }

    const merged = new Date(`${dateString || new Date().toISOString().split('T')[0]}T${timeString || '00:00:00'}`);
    return Number.isNaN(merged.getTime()) ? null : merged.toISOString();
}

function formatShiftDate(dateValue) {
    if (!dateValue) return '';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return String(dateValue).trim();
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatShiftTime(dateValue) {
    if (!dateValue) return '';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
        return String(dateValue).trim().split('T')[1]?.slice(0, 8) || String(dateValue).trim();
    }
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    const seconds = String(parsed.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function normalizeShiftRecord(shift) {
    if (!shift || typeof shift !== 'object') return null;

    const openingFloat = Number(shift.openingFloat ?? shift.startingCash ?? 0) || 0;
    const salesTotal = Number(shift.salesTotal ?? 0) || 0;
    const closingCashRaw = shift.closingCash ?? shift.actualCash;
    const closingCash = closingCashRaw == null || closingCashRaw === '' ? null : Number(closingCashRaw);
    const differenceRaw = shift.difference ?? shift.discrepancy;
    const difference = differenceRaw == null || differenceRaw === '' ? null : Number(differenceRaw);
    const openIso = toShiftDateTime(shift.openedAt || shift.createdAt || shift.openTime || shift.date, shift.date ? shift.openTime : '');
    const closeIso = toShiftDateTime(shift.closedAt || shift.closeTime, shift.date ? shift.closeTime : '');

    return {
        ...shift,
        id: String(shift.id || '').trim(),
        employeeId: toShiftEmployeeId(shift.employeeId),
        openingFloat,
        startingCash: Number(shift.startingCash ?? openingFloat) || 0,
        salesTotal,
        closingCash: closingCash == null || Number.isNaN(closingCash) ? null : closingCash,
        actualCash: closingCash == null || Number.isNaN(closingCash) ? null : closingCash,
        difference: difference == null || Number.isNaN(difference) ? null : difference,
        discrepancy: difference == null || Number.isNaN(difference) ? null : difference,
        notes: shift.notes || shift.note || '',
        note: shift.note || shift.notes || '',
        date: shift.date || formatShiftDate(openIso || shift.openTime),
        openTime: formatShiftTime(openIso || shift.openTime),
        closeTime: formatShiftTime(closeIso || shift.closeTime),
        openedAt: openIso || shift.openedAt || shift.createdAt || null,
        closedAt: closeIso || shift.closedAt || null,
        status: shift.status || 'open'
    };
}

function serializeShiftForApi(shift) {
    const normalized = normalizeShiftRecord(shift);
    if (!normalized) return shift;

    const openTimestamp = toShiftDateTime(normalized.date, normalized.openTime) || normalized.openedAt || new Date().toISOString();
    const closeTimestamp = normalized.status === 'closed'
        ? (toShiftDateTime(normalized.date, normalized.closeTime) || normalized.closedAt || new Date().toISOString())
        : null;

    return {
        ...shift,
        id: normalized.id || Date.now().toString(),
        employeeId: normalized.employeeId,
        openTime: openTimestamp,
        closeTime: closeTimestamp,
        startingCash: normalized.startingCash,
        actualCash: normalized.actualCash,
        discrepancy: normalized.discrepancy,
        expectedCash: normalized.startingCash + normalized.salesTotal,
        note: normalized.note,
        status: normalized.status
    };
}

async function getAllShifts() {
    const shifts = await fetchAPI('/shifts');
    return Array.isArray(shifts) ? shifts.map(normalizeShiftRecord).filter(Boolean) : [];
}

async function getShiftById(id) {
    return normalizeShiftRecord(await fetchAPI(`/shifts/${id}`));
}

async function getActiveShift() {
    const shifts = await getAllShifts();
    return shifts.find(s => s.status === 'open') || null;
}
function saveShift(shift) {
    const payload = serializeShiftForApi(shift);
    if (!payload.id) payload.id = Date.now().toString();
    if (shift._id || payload._id) return fetchAPI(`/shifts/${payload.id}`, { method: 'PUT', body: payload }).then(normalizeShiftRecord);
    return fetchAPI('/shifts', { method: 'POST', body: payload }).then(normalizeShiftRecord);
}

// ==========================================
// Returns
// ==========================================

function getAllReturns() { return fetchAPI('/returns'); }
function saveReturn(returnRecord) {
    if (!returnRecord.id) returnRecord.id = Date.now().toString();
    if (returnRecord._id) return fetchAPI(`/returns/${returnRecord.id}`, { method: 'PUT', body: returnRecord });
    return fetchAPI('/returns', { method: 'POST', body: returnRecord });
}
async function getReturnsByOriginalSaleId(saleId) {
    const returns = await getAllReturns();
    return returns.filter(r => r.originalSaleId === saleId.toString());
}

// ==========================================
// Suppliers
// ==========================================

function normalizeSupplierRecord(supplier) {
    if (!supplier || typeof supplier !== 'object') return null;

    return {
        ...supplier,
        id: String(supplier.id || supplier._id || '').trim(),
        name: supplier.name || '',
        contact: supplier.contact || supplier.contactPerson || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        location: supplier.location || supplier.address || '',
        categories: supplier.categories || supplier.suppliedItems || '',
        notes: supplier.notes || ''
    };
}

function serializeSupplierForApi(supplier) {
    const normalized = normalizeSupplierRecord(supplier);
    if (!normalized) return supplier;

    return {
        ...supplier,
        id: normalized.id || Date.now().toString(),
        name: normalized.name,
        contactPerson: normalized.contact,
        phone: normalized.phone,
        email: normalized.email,
        address: normalized.location,
        suppliedItems: normalized.categories,
        notes: normalized.notes
    };
}

async function getAllSuppliers() {
    const suppliers = await fetchAPI('/suppliers');
    return Array.isArray(suppliers)
        ? suppliers.map(normalizeSupplierRecord).filter(Boolean)
        : [];
}
function saveSupplier(supplier) {
    const serialized = serializeSupplierForApi(supplier);
    if (!serialized.id) serialized.id = Date.now().toString();
    if (serialized._id) return fetchAPI(`/suppliers/${serialized.id}`, { method: 'PUT', body: serialized });
    return fetchAPI('/suppliers', { method: 'POST', body: serialized });
}
function deleteSupplier(id) { return fetchAPI(`/suppliers/${id}`, { method: 'DELETE' }); }

function normalizePurchaseOrderRecord(order) {
    if (!order || typeof order !== 'object') return null;

    const itemSummary = Array.isArray(order.items)
        ? order.items
            .map((item) => {
                if (!item || typeof item !== 'object') return '';
                const quantity = item.quantity ? `${item.quantity}x ` : '';
                const itemName = item.itemClass || item.name || item.itemName || '';
                return `${quantity}${itemName}`.trim();
            })
            .filter(Boolean)
            .join(', ')
        : String(order.items || '').trim();

    const totalAmount = Number(order.totalAmount ?? order.cost ?? 0) || 0;

    return {
        ...order,
        id: String(order.id || order._id || '').trim(),
        supplierId: String(order.supplierId || '').trim(),
        date: order.date || order.orderDate || '',
        orderDate: order.orderDate || order.date || '',
        deliveryDate: order.deliveryDate || order.expectedDate || '',
        expectedDate: order.expectedDate || order.deliveryDate || '',
        items: itemSummary,
        cost: totalAmount,
        totalAmount,
        status: order.status || 'pending',
        notes: order.notes || ''
    };
}

function serializePurchaseOrderForApi(order) {
    const normalized = normalizePurchaseOrderRecord(order);
    if (!normalized) return order;

    const itemText = String(normalized.items || '').trim();
    const normalizedItems = itemText
        ? itemText.split(',')
            .map((chunk) => chunk.trim())
            .filter(Boolean)
            .map((chunk) => {
                const match = chunk.match(/^(\d+)\s*x?\s*(.+)$/i);
                if (match) {
                    const quantity = Number(match[1]) || 1;
                    const itemClass = match[2].trim();
                    return {
                        itemClass,
                        quantity,
                        total: 0
                    };
                }

                return {
                    itemClass: chunk,
                    quantity: 1,
                    total: 0
                };
            })
        : [];

    return {
        ...order,
        id: normalized.id || Date.now().toString(),
        supplierId: normalized.supplierId,
        orderDate: normalized.orderDate,
        expectedDate: normalized.expectedDate,
        items: normalizedItems,
        totalAmount: normalized.totalAmount,
        status: normalized.status,
        notes: normalized.notes
    };
}

async function getAllPurchaseOrders() {
    const orders = await fetchAPI('/suppliers/po/all');
    return Array.isArray(orders)
        ? orders.map(normalizePurchaseOrderRecord).filter(Boolean)
        : [];
}
function savePurchaseOrder(po) {
    const serialized = serializePurchaseOrderForApi(po);
    if (!serialized.id) serialized.id = Date.now().toString();
    if (serialized._id) return fetchAPI(`/suppliers/po/${serialized.id}`, { method: 'PUT', body: serialized });
    return fetchAPI('/suppliers/po/new', { method: 'POST', body: serialized });
}
function deletePurchaseOrder(id) { return fetchAPI(`/suppliers/po/${id}`, { method: 'DELETE' }); } // Faked for now

// ==========================================
// Discount Rules
// ==========================================

function getAllDiscountRules() { return fetchAPI('/discounts'); }
function saveDiscountRule(rule) {
    if (!rule.id) rule.id = Date.now().toString();
    if (rule._id) return fetchAPI(`/discounts/${rule.id}`, { method: 'PUT', body: rule });
    return fetchAPI('/discounts', { method: 'POST', body: rule });
}
function deleteDiscountRule(id) { return fetchAPI(`/discounts/${id}`, { method: 'DELETE' }); }

// ==========================================
// Employee Advances
// ==========================================

function normalizeAdvanceRecord(advance) {
    if (!advance || typeof advance !== 'object') return null;

    return {
        ...advance,
        id: String(advance.id || '').trim(),
        employeeId: String(advance.employeeId || '').trim(),
        amount: Number(advance.amount || 0),
        type: advance.type || 'cash',
        date: String(advance.date || '').trim(),
        reason: advance.reason || advance.notes || '',
        notes: advance.notes || advance.reason || '',
        status: advance.status || 'pending'
    };
}

function getAllAdvances() {
    return fetchAPI('/advances').then((advances) => (
        Array.isArray(advances)
            ? advances.map(normalizeAdvanceRecord).filter(Boolean)
            : []
    ));
}
async function getAdvancesByEmployeeId(empId) {
    const advances = await getAllAdvances();
    return advances.filter(a => a.employeeId === String(empId));
}
function saveAdvance(advance) {
    if (!advance.id) advance.id = Date.now().toString();
    const body = {
        ...advance,
        employeeId: String(advance.employeeId || '').trim(),
        reason: advance.reason || advance.notes || '',
        date: advance.date || new Date().toISOString().split('T')[0]
    };
    if (advance._id) return fetchAPI(`/advances/${advance.id}`, { method: 'PUT', body }).then(normalizeAdvanceRecord);
    return fetchAPI('/advances', { method: 'POST', body }).then(normalizeAdvanceRecord);
}
function deleteAdvance(id) { return fetchAPI(`/advances/${id}`, { method: 'DELETE' }); }

// ==========================================
// Mongo Sync
// ==========================================

function getSyncStatus() {
    return fetchAPI('/sync/status');
}

function runMongoSync({ direction = 'active-to-standby', collections = null } = {}) {
    const body = { direction };
    if (Array.isArray(collections) && collections.length) {
        body.collections = collections;
    }
    return fetchAPI('/sync/run', { method: 'POST', body });
}

if (typeof window !== 'undefined') {
    Object.assign(window.POS_API, {
        fetchAPI,
        initDatabase,
        whenDatabaseReady,
        saveSale,
        getAllSales,
        getInventoryItem,
        addLoyaltyPoints,
        getSyncStatus,
        runMongoSync
    });

    Object.assign(window, {
        db,
        fetchAPI,
        initDatabase,
        saveSale,
        getAllSales,
        getInventoryItem,
        addLoyaltyPoints
    });

    void whenDatabaseReady().catch((error) => {
        console.warn('POS database wrapper failed to initialize:', error);
    });
}

/* placeholder aria-label */
