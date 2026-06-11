import type {
  AdvancedAnalytics,
  AuthSession,
  AuthUser,
  BarcodeRender,
  DiscountRule,
  ElectronDiagnostics,
  HealthResponse,
  InventoryTransaction,
  Item,
  PurchaseOrder,
  Supplier
} from './types';
import {
  normalizeDiscountRule,
  normalizeItem,
  normalizePurchaseOrder,
  normalizeSupplier,
  serializePurchaseOrder,
  serializeSupplier
} from './utils';

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

let cachedAuthToken = '';
let resolvedApiOriginPromise: Promise<string> | null = null;

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

export function normalizeApiOrigin(origin?: string): string {
  let value = String(origin || '').trim();
  if (!value) return DEFAULT_API_ORIGIN;

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    value = `http://${value}`;
  }

  const url = new URL(value);
  const isLoopback = isLoopbackHost(url.hostname);
  const isHttps = url.protocol === 'https:';
  const isLoopbackHttp = isLoopback && url.protocol === 'http:';

  if (!isHttps && !isLoopbackHttp) {
    throw new Error('Use http://localhost for local APIs or https:// for hosted APIs.');
  }

  if (url.username || url.password) {
    throw new Error('API origin must not include credentials.');
  }

  if (isLoopback && !url.port) {
    return `${url.protocol}//${url.hostname}:5000`;
  }

  return url.origin;
}

function getSavedApiOrigin(): string {
  try {
    const saved = localStorage.getItem(API_ORIGIN_KEY);
    return saved ? normalizeApiOrigin(saved) : '';
  } catch {
    return '';
  }
}

export function getApiOrigin(): string {
  try {
    return normalizeApiOrigin(localStorage.getItem(API_ORIGIN_KEY) || DEFAULT_API_ORIGIN);
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

export function setApiOrigin(origin: string): string {
  const normalized = normalizeApiOrigin(origin);
  localStorage.setItem(API_ORIGIN_KEY, normalized);
  resolvedApiOriginPromise = null;
  return normalized;
}

async function probeApiOrigin(origin: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${origin}${API_HEALTHCHECK_PATH}`, {
      cache: 'no-store',
      signal: controller.signal
    });
    return response.ok || response.status === 503;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function resolveApiOrigin(forceRefresh = false): Promise<string> {
  if (!forceRefresh && resolvedApiOriginPromise) return resolvedApiOriginPromise;

  resolvedApiOriginPromise = (async () => {
    const savedOrigin = getSavedApiOrigin();
    const candidates = [savedOrigin || normalizeApiOrigin(DEFAULT_API_ORIGIN)];

    if (!savedOrigin || isLoopbackHost(new URL(savedOrigin).hostname)) {
      LOCAL_API_CANDIDATES.forEach((candidate) => {
        const normalized = normalizeApiOrigin(candidate);
        if (!candidates.includes(normalized)) candidates.push(normalized);
      });
    }

    for (const candidate of candidates) {
      if (await probeApiOrigin(candidate)) {
        localStorage.setItem(API_ORIGIN_KEY, candidate);
        return candidate;
      }
    }

    return savedOrigin || normalizeApiOrigin(DEFAULT_API_ORIGIN);
  })();

  return resolvedApiOriginPromise;
}

export async function loadSecureToken(): Promise<void> {
  if (window.electronAPI?.getAuthToken) {
    try {
      cachedAuthToken = (await window.electronAPI.getAuthToken()) || '';
      if (cachedAuthToken) localStorage.setItem(AUTH_TOKEN_KEY, cachedAuthToken);
    } catch {
      cachedAuthToken = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    }
  } else {
    cachedAuthToken = localStorage.getItem(AUTH_TOKEN_KEY) || '';
  }
}

export function getAuthToken(): string {
  return cachedAuthToken || localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

export async function setAuthToken(token: string): Promise<void> {
  cachedAuthToken = token || '';
  localStorage.setItem(AUTH_TOKEN_KEY, cachedAuthToken);
  if (window.electronAPI?.setAuthToken) {
    await window.electronAPI.setAuthToken(cachedAuthToken);
  }
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setAuthUser(user: AuthUser): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function isAuthenticated(): boolean {
  const token = getAuthToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(window.atob(token.split('.')[1])) as { exp?: number };
    return Boolean(payload.exp && payload.exp * 1000 > Date.now());
  } catch {
    return false;
  }
}

export async function logoutUser(): Promise<void> {
  cachedAuthToken = '';
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  if (window.electronAPI?.deleteAuthToken) {
    await window.electronAPI.deleteAuthToken();
  }
}

export async function loginUser(username: string, password: string): Promise<AuthSession> {
  const apiOrigin = await resolveApiOrigin();
  const response = await fetch(`${apiOrigin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = (await response.json().catch(() => ({}))) as Partial<AuthSession> & { error?: string };
  if (!response.ok || !data.token || !data.user) {
    throw new Error(data.error || 'Login failed.');
  }
  await setAuthToken(data.token);
  setAuthUser(data.user);
  return data as AuthSession;
}

export async function registerUser(
  username: string,
  password: string,
  role: AuthUser['role'] = 'cashier',
  employeeId: string | null = null
): Promise<AuthSession> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const apiOrigin = await resolveApiOrigin();
  const response = await fetch(`${apiOrigin}/api/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password, role, employeeId })
  });
  const data = (await response.json().catch(() => ({}))) as Partial<AuthSession> & { error?: string };
  if (!response.ok || !data.token || !data.user) {
    throw new Error(data.error || 'Registration failed.');
  }
  await setAuthToken(data.token);
  setAuthUser(data.user);
  return data as AuthSession;
}

type JsonBody = object;
type ApiRequestOptions = Omit<RequestInit, 'body'> & { body?: BodyInit | JsonBody | null };

function isJsonBody(body: ApiRequestOptions['body']): body is JsonBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer)
  );
}

export async function fetchApi<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, ...init } = options;
  const requestOptions: RequestInit = { ...init };
  if (isJsonBody(body)) {
    requestOptions.body = JSON.stringify(body);
    requestOptions.headers = {
      ...requestOptions.headers,
      'Content-Type': 'application/json'
    };
  } else if (body) {
    requestOptions.body = body;
  }

  const token = getAuthToken();
  if (token) {
    requestOptions.headers = {
      ...requestOptions.headers,
      Authorization: `Bearer ${token}`
    };
  }

  const apiOrigin = await resolveApiOrigin();
  const response = await fetch(`${apiOrigin}/api${endpoint}`, requestOptions);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string; details?: string[] };

  if (response.status === 401) {
    await logoutUser();
    window.dispatchEvent(new Event('stock-auth-expired'));
  }

  if (!response.ok) {
    const detail = Array.isArray(data.details) ? ` ${data.details.join(', ')}` : '';
    throw new Error(`${data.error || response.statusText}.${detail}`.trim());
  }

  return data;
}

export async function getHealth(): Promise<HealthResponse> {
  const apiOrigin = await resolveApiOrigin(true);
  const response = await fetch(`${apiOrigin}/api/health`, { cache: 'no-store' });
  return (await response.json()) as HealthResponse;
}

export async function getItems(): Promise<Item[]> {
  const items = await fetchApi<Partial<Item>[]>('/items');
  return items.map(normalizeItem);
}

export async function getItem(sku: string): Promise<Item> {
  return normalizeItem(await fetchApi<Item>(`/items/${encodeURIComponent(sku)}`));
}

export async function saveItem(item: Item): Promise<Item> {
  return normalizeItem(
    await fetchApi<Item>('/items', {
      method: 'POST',
      body: item
    })
  );
}

export async function updateItem(sku: string, item: Partial<Item>): Promise<Item> {
  return normalizeItem(
    await fetchApi<Item>(`/items/${encodeURIComponent(sku)}`, {
      method: 'PUT',
      body: item
    })
  );
}

export async function deleteItem(sku: string): Promise<void> {
  await fetchApi(`/items/${encodeURIComponent(sku)}`, { method: 'DELETE' });
}

export async function importItems(csv: string): Promise<{ updated?: number; errors?: string[] }> {
  return fetchApi('/items/import', {
    method: 'POST',
    body: { csv }
  });
}

export async function getItemTransactions(sku: string): Promise<InventoryTransaction[]> {
  return fetchApi<InventoryTransaction[]>(`/items/${encodeURIComponent(sku)}/transactions`);
}

export async function generateStructuredBarcode(payload: {
  sku: string;
  category: string;
  price: number;
  storedAt?: string;
}): Promise<{ format: string; code: string }> {
  return fetchApi('/barcode/generate', {
    method: 'POST',
    body: { format: 'structured', ...payload }
  });
}

export async function renderBarcodePng(
  text: string,
  symbology = 'code128',
  scale = 3,
  height = 12,
  includetext = true
): Promise<BarcodeRender> {
  return fetchApi('/barcode/render', {
    method: 'POST',
    body: { text, symbology, scale, height, includetext }
  });
}

export async function getAdvancedAnalytics(): Promise<AdvancedAnalytics> {
  return fetchApi('/sales/analytics/advanced');
}

export async function getSuppliers(): Promise<Supplier[]> {
  const suppliers = await fetchApi<Partial<Supplier>[]>('/suppliers');
  return suppliers.map(normalizeSupplier);
}

export async function saveSupplierRecord(supplier: Partial<Supplier>): Promise<Supplier> {
  const serialized = serializeSupplier(supplier);
  if (supplier._id || supplier.id) {
    return normalizeSupplier(
      await fetchApi<Supplier>(`/suppliers/${encodeURIComponent(serialized.id)}`, {
        method: 'PUT',
        body: serialized
      })
    );
  }
  return normalizeSupplier(
    await fetchApi<Supplier>('/suppliers', {
      method: 'POST',
      body: serialized
    })
  );
}

export async function deleteSupplierRecord(id: string): Promise<void> {
  await fetchApi(`/suppliers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  const orders = await fetchApi<Partial<PurchaseOrder>[]>('/suppliers/po/all');
  return orders.map(normalizePurchaseOrder);
}

export async function savePurchaseOrderRecord(order: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
  const serialized = serializePurchaseOrder(order);
  if (order._id || order.id) {
    return normalizePurchaseOrder(
      await fetchApi<PurchaseOrder>(`/suppliers/po/${encodeURIComponent(serialized.id)}`, {
        method: 'PUT',
        body: serialized
      })
    );
  }
  return normalizePurchaseOrder(
    await fetchApi<PurchaseOrder>('/suppliers/po/new', {
      method: 'POST',
      body: serialized
    })
  );
}

export async function getDiscountRules(): Promise<DiscountRule[]> {
  const rules = await fetchApi<Partial<DiscountRule>[]>('/discounts');
  return rules.map(normalizeDiscountRule);
}

export async function saveDiscountRuleRecord(rule: Partial<DiscountRule>): Promise<DiscountRule> {
  const normalized = normalizeDiscountRule(rule);
  if (rule._id || rule.id) {
    return normalizeDiscountRule(
      await fetchApi<DiscountRule>(`/discounts/${encodeURIComponent(normalized.id)}`, {
        method: 'PUT',
        body: normalized
      })
    );
  }
  return normalizeDiscountRule(
    await fetchApi<DiscountRule>('/discounts', {
      method: 'POST',
      body: normalized
    })
  );
}

export async function deleteDiscountRuleRecord(id: string): Promise<void> {
  await fetchApi(`/discounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getSystemUsers(): Promise<AuthUser[]> {
  return fetchApi<AuthUser[]>('/auth/users');
}

export async function createSystemUserAccount(payload: {
  username: string;
  password: string;
  role: AuthUser['role'];
  employeeId?: string | null;
  pin?: string | null;
}): Promise<AuthUser> {
  const session = await fetchApi<AuthSession>('/auth/register', {
    method: 'POST',
    body: payload
  });
  return session.user;
}

export async function updateSystemUserAccount(
  userId: string,
  updates: Partial<AuthUser> & { password?: string; pin?: string | null }
): Promise<AuthUser> {
  return fetchApi<AuthUser>(`/auth/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: updates
  });
}

export async function runMongoSync(): Promise<unknown> {
  return fetchApi('/sync/run', {
    method: 'POST',
    body: { direction: 'active-to-standby' }
  });
}

export async function getElectronDiagnostics(): Promise<ElectronDiagnostics> {
  if (!window.electronAPI?.getSyncDiagnostics) {
    return { pendingSalesCount: 0, cachedItemsCount: 0, cachedItems: [] };
  }
  return window.electronAPI.getSyncDiagnostics();
}

export async function rebuildCashierItemsCache(items: Item[]): Promise<boolean> {
  if (!window.electronAPI?.writeSimplePosItemsCache) return false;
  return window.electronAPI.writeSimplePosItemsCache(items);
}
