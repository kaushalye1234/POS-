export type Role = 'admin' | 'manager' | 'cashier';

export interface AuthUser {
  id?: string;
  _id?: string;
  username: string;
  role: Role;
  employeeId?: string | null;
  isActive?: boolean;
  lastLogin?: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface Item {
  _id?: string;
  sku: string;
  barcode?: string | null;
  name: string;
  category: string;
  size?: string;
  price: number;
  costPrice: number;
  maxDiscountPercent: number;
  stockLevel: number;
  lowStockThreshold: number;
  criticalStockThreshold: number;
  imageUrl?: string;
  storedAt?: string;
  createdAt?: string;
}

export interface InventoryTransaction {
  _id?: string;
  id?: string;
  sku: string;
  type?: string;
  source?: string;
  quantity?: number;
  previousStock?: number;
  newStock?: number;
  note?: string;
  createdAt?: string;
}

export interface AdvancedAnalyticsItem {
  sku: string;
  name: string;
  category: string;
  revenue: number;
  profit: number;
  units: number;
  costPrice: number;
  price: number;
  markup: number;
  margin: number;
  stockLevel: number;
  velocity7: number;
  velocity30: number;
  abcCategory: 'A' | 'B' | 'C';
}

export interface AdvancedAnalytics {
  financials: {
    totalRevenue: number;
    totalCost: number;
    totalGrossProfit: number;
    netProfitMargin: number;
    revenue30Days: number;
    cogs30Days: number;
    profit30Days: number;
  };
  inventoryMetrics: {
    currentInventoryValue: number;
    itr: number;
    dsi: number;
    gmroi: number;
  };
  categories: Array<{
    category: string;
    revenue: number;
    cost: number;
    profit: number;
    units: number;
  }>;
  items: AdvancedAnalyticsItem[];
  alerts: {
    lowStock: StockAlert[];
    criticalRestock: StockAlert[];
  };
}

export interface StockAlert {
  sku: string;
  name: string;
  stockLevel: number;
  threshold: number;
  category: string;
}

export interface Supplier {
  _id?: string;
  id: string;
  name: string;
  contact?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  location?: string;
  address?: string;
  categories?: string;
  suppliedItems?: string;
  notes?: string;
  status?: 'active' | 'inactive';
  createdAt?: string;
}

export interface PurchaseOrderItem {
  itemClass: string;
  quantity: number;
  costPrice?: number;
  total?: number;
}

export interface PurchaseOrder {
  _id?: string;
  id: string;
  supplierId: string;
  orderDate?: string;
  date?: string;
  expectedDate?: string;
  deliveryDate?: string;
  items: PurchaseOrderItem[] | string;
  totalAmount?: number;
  cost?: number;
  status: 'pending' | 'ordered' | 'received' | 'cancelled';
  notes?: string;
  createdAt?: string;
}

export interface DiscountRule {
  _id?: string;
  id: string;
  name: string;
  type: 'percentage' | 'fixed' | 'bogo';
  valueType: 'fixed' | 'range';
  value: number;
  valueMin: number;
  valueMax: number;
  appliesTo: string;
  minPurchase: number;
  startDate: string;
  endDate: string;
  description: string;
  active: boolean;
  createdAt?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  message: string;
  version: string;
  timestamp: string;
  database: {
    ready: boolean;
    readyState: number;
    status: string;
    connectionMode: string;
    activeSource: string;
    fallbackUsed: boolean;
  };
  transactionSupport: boolean;
  sync?: unknown;
}

export interface ElectronDiagnostics {
  pendingSalesCount: number;
  cachedItemsCount: number;
  cachedItems: Item[];
}

export interface PrinterInfo {
  name: string;
  displayName?: string;
  description?: string;
  status?: number;
  isDefault?: boolean;
}

export type LabelElementKey = 'brand' | 'name' | 'category' | 'size' | 'customText' | 'barcode' | 'sku' | 'price';
export type LabelTextAlign = 'left' | 'center' | 'right';
export type LabelPresetKey = 'centered' | 'leftTextRightBarcode' | 'compactFull';

export interface LabelElementLayout {
  visible: boolean;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  fontSizePx: number;
  rotationDeg: number;
  align: LabelTextAlign;
}

export type LabelLayoutElements = Record<LabelElementKey, LabelElementLayout>;

export interface LabelLayout {
  preset: LabelPresetKey;
  customText: string;
  elements: LabelLayoutElements;
}

export interface PrinterSettings {
  printerName: string;
  labelWidth: number;
  labelHeight: number;
  printOrientation: 'portrait' | 'landscape';
  contentRotation: '0' | '90' | '180' | '270';
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  fontSize: number;
  padding: number;
  showBrand: boolean;
  showPrice: boolean;
  labelLayout: LabelLayout;
}

export interface ImportPreview {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface BarcodeRender {
  mime: string;
  data: string;
}

export interface ElectronApi {
  printReceipt?: (html: string, options?: unknown) => void;
  printThermalLabel?: (payload: unknown) => Promise<{ success: boolean; error?: string }>;
  setAuthToken?: (token: string) => Promise<void>;
  getAuthToken?: () => Promise<string>;
  deleteAuthToken?: () => Promise<void>;
  getPrinters?: () => Promise<PrinterInfo[]>;
  getSyncDiagnostics?: () => Promise<ElectronDiagnostics>;
  writeSimplePosItemsCache?: (data: Item[]) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronApi;
  }
}
