import type {
  DiscountRule,
  ImportPreview,
  Item,
  LabelElementKey,
  LabelElementLayout,
  LabelLayout,
  LabelLayoutElements,
  LabelPresetKey,
  LabelTextAlign,
  PrinterSettings,
  PurchaseOrder,
  Supplier
} from './types';

export const PRINTER_SETTINGS_KEY = 'fashion_shaa_printer_settings';

export const ITEM_SIZE_OPTIONS = [
  'Free Size',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  '4XL',
  '5XL',
  ...Array.from({ length: 23 }, (_, index) => String(index + 24)),
  'Newborn',
  '0-3M',
  '3-6M',
  '6-12M',
  '1Y',
  '2Y',
  '3Y',
  '4Y',
  '5Y',
  '6Y',
  '7Y',
  '8Y',
  '9Y',
  '10Y',
  '11Y',
  '12Y',
  '13Y',
  '14Y'
];

export const LABEL_ELEMENT_KEYS: LabelElementKey[] = ['brand', 'name', 'category', 'size', 'customText', 'barcode', 'sku', 'price'];

export const LABEL_ELEMENT_LABELS: Record<LabelElementKey, string> = {
  brand: 'Brand',
  name: 'Product Name',
  category: 'Category',
  size: 'Size',
  customText: 'Custom Text',
  barcode: 'Barcode',
  sku: 'SKU',
  price: 'Price'
};

export const LABEL_PRESET_LABELS: Record<LabelPresetKey, string> = {
  centered: 'Centered Barcode',
  leftTextRightBarcode: 'Left Text Right Barcode',
  compactFull: 'Compact Full'
};

const DEFAULT_LABEL_WIDTH_MM = 37.5;
const DEFAULT_LABEL_HEIGHT_MM = 25;

export function createLabelLayoutPreset(
  preset: LabelPresetKey,
  labelWidth = DEFAULT_LABEL_WIDTH_MM,
  labelHeight = DEFAULT_LABEL_HEIGHT_MM
): LabelLayout {
  const fullWidth = Math.max(1, labelWidth);
  const fullHeight = Math.max(1, labelHeight);
  const el = (
    visible: boolean,
    xMm: number,
    yMm: number,
    widthMm: number,
    heightMm: number,
    fontSizePx: number,
    rotationDeg = 0,
    align: LabelTextAlign = 'center'
  ): LabelElementLayout =>
    clampLabelElement(
      {
        visible,
        xMm,
        yMm,
        widthMm,
        heightMm,
        fontSizePx,
        rotationDeg,
        align
      },
      fullWidth,
      fullHeight
    );

  if (preset === 'leftTextRightBarcode') {
    return {
      preset,
      customText: 'NEW',
      elements: {
        brand: el(true, 1, 1, 14, 3, 6, 0, 'left'),
        name: el(true, 1, 4.4, 14, 4.5, 7, 0, 'left'),
        category: el(true, 1, 9, 9, 3, 5, 0, 'left'),
        size: el(true, 10.5, 9, 4.5, 3, 6, 0, 'right'),
        customText: el(false, 1, 12.2, 14, 3, 5, 0, 'left'),
        barcode: el(true, 16, 1.2, 20.2, 16.8, 8, 0, 'center'),
        sku: el(true, 1, 18.6, 16, 3.2, 6, 0, 'left'),
        price: el(true, 19, 18.2, 17, 4, 8, 0, 'right')
      }
    };
  }

  if (preset === 'compactFull') {
    return {
      preset,
      customText: 'THANK YOU',
      elements: {
        brand: el(true, 1, 0.8, 35.5, 2.5, 5, 0, 'center'),
        name: el(true, 1, 3.5, 35.5, 3.5, 6, 0, 'center'),
        category: el(true, 1, 7, 11, 2.5, 5, 0, 'left'),
        size: el(true, 13, 7, 7, 2.5, 6, 0, 'center'),
        customText: el(true, 23, 7, 13.5, 2.5, 5, 0, 'right'),
        barcode: el(true, 3, 9.8, 31.5, 9, 7, 0, 'center'),
        sku: el(true, 1, 19.5, 16, 3, 5, 0, 'left'),
        price: el(true, 21, 19, 15.5, 3.8, 7, 0, 'right')
      }
    };
  }

  return {
    preset: 'centered',
    customText: 'NEW',
    elements: {
      brand: el(true, 1, 1, 35.5, 2.8, 6, 0, 'center'),
      name: el(true, 1, 4.1, 35.5, 3.7, 7, 0, 'center'),
      category: el(false, 1, 7.9, 13, 2.8, 5, 0, 'left'),
      size: el(true, 14.5, 7.9, 8.5, 2.8, 6, 0, 'center'),
      customText: el(false, 23.5, 7.9, 13, 2.8, 5, 0, 'right'),
      barcode: el(true, 2, 10.8, 33.5, 7.2, 8, 0, 'center'),
      sku: el(true, 1, 19.2, 15.5, 3.2, 6, 0, 'left'),
      price: el(true, 20, 18.7, 16.5, 4, 8, 0, 'right')
    }
  };
}

export const DEFAULT_LABEL_LAYOUT = createLabelLayoutPreset('centered');

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  printerName: '',
  labelWidth: DEFAULT_LABEL_WIDTH_MM,
  labelHeight: DEFAULT_LABEL_HEIGHT_MM,
  printOrientation: 'portrait',
  contentRotation: '0',
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
  fontSize: 7,
  padding: 1,
  showBrand: true,
  showPrice: true,
  labelLayout: DEFAULT_LABEL_LAYOUT
};

export interface LabelRenderData {
  brand: string;
  name: string;
  category: string;
  size: string;
  customText: string;
  barcodeDataUrl: string;
  barcodeText: string;
  sku: string;
  price: string;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong.';
}

export function formatCurrency(value: number | null | undefined): string {
  return `Rs. ${Number(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatNumber(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString('en-LK');
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampLabelElement(element: LabelElementLayout, labelWidth: number, labelHeight: number): LabelElementLayout {
  const widthMm = clamp(Number(element.widthMm), 1, Math.max(1, labelWidth));
  const heightMm = clamp(Number(element.heightMm), 1, Math.max(1, labelHeight));
  return {
    visible: Boolean(element.visible),
    xMm: clamp(Number(element.xMm), 0, Math.max(0, labelWidth - widthMm)),
    yMm: clamp(Number(element.yMm), 0, Math.max(0, labelHeight - heightMm)),
    widthMm,
    heightMm,
    fontSizePx: clamp(Number(element.fontSizePx), 3, 36),
    rotationDeg: clamp(Number(element.rotationDeg), -180, 180),
    align: ['left', 'center', 'right'].includes(element.align) ? element.align : 'center'
  };
}

export function normalizeLabelLayout(raw: Partial<LabelLayout> | undefined, labelWidth: number, labelHeight: number): LabelLayout {
  const preset = raw?.preset && LABEL_PRESET_LABELS[raw.preset] ? raw.preset : 'centered';
  const fallback = createLabelLayoutPreset(preset, labelWidth, labelHeight);
  const rawElements = (raw?.elements || {}) as Partial<LabelLayoutElements>;

  const elements = LABEL_ELEMENT_KEYS.reduce<LabelLayoutElements>((acc, key) => {
    acc[key] = clampLabelElement(
      {
        ...fallback.elements[key],
        ...(rawElements[key] || {})
      },
      labelWidth,
      labelHeight
    );
    return acc;
  }, {} as LabelLayoutElements);

  return {
    preset,
    customText: String(raw?.customText ?? fallback.customText ?? ''),
    elements
  };
}

export function normalizePrinterSettings(raw: Partial<PrinterSettings> | undefined): PrinterSettings {
  const merged = { ...DEFAULT_PRINTER_SETTINGS, ...(raw || {}) };
  const labelWidth = clamp(Number(merged.labelWidth), 10, 120);
  const labelHeight = clamp(Number(merged.labelHeight), 10, 80);

  return {
    ...merged,
    labelWidth,
    labelHeight,
    marginTop: clamp(Number(merged.marginTop), 0, labelHeight - 1),
    marginBottom: clamp(Number(merged.marginBottom), 0, labelHeight - 1),
    marginLeft: clamp(Number(merged.marginLeft), 0, labelWidth - 1),
    marginRight: clamp(Number(merged.marginRight), 0, labelWidth - 1),
    fontSize: clamp(Number(merged.fontSize), 3, 36),
    padding: clamp(Number(merged.padding), 0, 24),
    showBrand: merged.showBrand !== false,
    showPrice: merged.showPrice !== false,
    labelLayout: normalizeLabelLayout(merged.labelLayout, labelWidth, labelHeight)
  };
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function makeTestLabelData(settings: PrinterSettings): LabelRenderData {
  return {
    brand: 'FASHION SHAA',
    name: 'TEST PRODUCT',
    category: 'Ladies',
    size: 'M',
    customText: settings.labelLayout.customText || 'NEW',
    barcodeDataUrl: '',
    barcodeText: 'FS-TST-01',
    sku: 'ITM-1',
    price: 'Rs. 1,250.00'
  };
}

export function makeItemLabelData(item: Item, barcodeDataUrl: string, barcodeText: string, settings: PrinterSettings): LabelRenderData {
  return {
    brand: 'FASHION SHAA',
    name: item.name || 'Product',
    category: item.category || 'Other',
    size: item.size || '',
    customText: settings.labelLayout.customText || '',
    barcodeDataUrl,
    barcodeText,
    sku: item.sku || '',
    price: `Rs. ${Number(item.price || 0).toLocaleString('en-LK')}`
  };
}

export function labelCopyCount(value: number | string | null | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return clamp(Math.floor(numeric), 1, 500);
}

function elementContent(key: LabelElementKey, data: LabelRenderData): string {
  switch (key) {
    case 'brand':
      return data.brand;
    case 'name':
      return data.name;
    case 'category':
      return data.category;
    case 'size':
      return data.size;
    case 'customText':
      return data.customText;
    case 'sku':
      return data.sku;
    case 'price':
      return data.price;
    case 'barcode':
      return data.barcodeText;
    default:
      return '';
  }
}

export function buildLabelHtml(settingsInput: PrinterSettings, data: LabelRenderData, copies = 1): string {
  const settings = normalizePrinterSettings(settingsInput);
  const printableWidth = Math.max(1, settings.labelWidth - settings.marginLeft - settings.marginRight);
  const printableHeight = Math.max(1, settings.labelHeight - settings.marginTop - settings.marginBottom);
  const copyCount = labelCopyCount(copies);

  const elementsHtml = LABEL_ELEMENT_KEYS.map((key) => {
    const element = clampLabelElement(settings.labelLayout.elements[key], printableWidth, printableHeight);
    if (!element.visible) return '';

    const commonStyle = [
      `left:${element.xMm}mm`,
      `top:${element.yMm}mm`,
      `width:${element.widthMm}mm`,
      `height:${element.heightMm}mm`,
      `font-size:${element.fontSizePx}px`,
      `text-align:${element.align}`,
      `transform:rotate(${element.rotationDeg}deg)`
    ].join(';');

    if (key === 'barcode') {
      const barcodeInner = data.barcodeDataUrl
        ? `<img src="${data.barcodeDataUrl}" alt="${escapeHtml(data.barcodeText)}" />`
        : `<div class="bars" aria-label="${escapeHtml(data.barcodeText)}"></div>`;
      return `<div class="label-el label-barcode" style="${commonStyle}">${barcodeInner}</div>`;
    }

    return `<div class="label-el label-text label-${key}" style="${commonStyle}">${escapeHtml(elementContent(key, data))}</div>`;
  }).join('');
  const labelsHtml = Array.from({ length: copyCount }, () => `<div class="label">
    ${elementsHtml}
  </div>`).join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barcode Label</title>
  <style>
    @page {
      size: ${settings.labelWidth}mm ${settings.labelHeight}mm;
      margin: ${settings.marginTop}mm ${settings.marginRight}mm ${settings.marginBottom}mm ${settings.marginLeft}mm;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      width: ${settings.labelWidth}mm;
      min-height: ${settings.labelHeight}mm;
      background: #fff;
      color: #000;
      font-family: Arial, sans-serif;
      overflow: visible;
    }

    .label {
      box-sizing: border-box;
      position: relative;
      width: ${printableWidth}mm;
      height: ${printableHeight}mm;
      padding: ${settings.padding}px;
      transform: rotate(${settings.contentRotation}deg);
      transform-origin: center center;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
    }

    .label:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    .label-el {
      box-sizing: border-box;
      position: absolute;
      transform-origin: center center;
      overflow: hidden;
    }

    .label-text {
      display: flex;
      align-items: center;
      line-height: 1;
      font-weight: 700;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: #000;
    }

    .label-text[style*="text-align:left"] {
      justify-content: flex-start;
    }

    .label-text[style*="text-align:center"] {
      justify-content: center;
    }

    .label-text[style*="text-align:right"] {
      justify-content: flex-end;
    }

    .label-brand {
      font-weight: 800;
      letter-spacing: .04em;
    }

    .label-price {
      font-weight: 800;
    }

    .label-barcode {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .label-barcode img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .bars {
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(
        90deg,
        #000 0 1px,
        transparent 1px 2px,
        #000 2px 3px,
        transparent 3px 5px
      );
    }
  </style>
</head>
<body>
  ${labelsHtml}
</body>
</html>`;
}

export function parseNumericIdFromSku(sku: string): number | null {
  const match = String(sku || '').match(/^ITM-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function inventorySkuFromId(id: number | string): string {
  const raw = String(id || '').trim();
  if (/^ITM-/i.test(raw)) return raw.toUpperCase();
  return `ITM-${raw}`;
}

export function normalizeItem(raw: Partial<Item>): Item {
  return {
    sku: String(raw.sku || '').trim(),
    barcode: raw.barcode || null,
    name: raw.name || '',
    category: raw.category || 'Other',
    size: String(raw.size || '').trim(),
    price: Number(raw.price || 0),
    costPrice: Number(raw.costPrice || 0),
    maxDiscountPercent: Number(raw.maxDiscountPercent ?? 30),
    stockLevel: Number(raw.stockLevel || 0),
    lowStockThreshold: Number(raw.lowStockThreshold ?? 10),
    criticalStockThreshold: Number(raw.criticalStockThreshold ?? 3),
    imageUrl: raw.imageUrl || '',
    storedAt: raw.storedAt,
    createdAt: raw.createdAt,
    _id: raw._id
  };
}

export function itemStatus(item: Item): 'critical' | 'low' | 'healthy' {
  if (item.stockLevel <= item.criticalStockThreshold) return 'critical';
  if (item.stockLevel <= item.lowStockThreshold) return 'low';
  return 'healthy';
}

export function marginPercent(item: Pick<Item, 'price' | 'costPrice'>): number {
  return item.price > 0 ? ((item.price - item.costPrice) / item.price) * 100 : 0;
}

export function markupPercent(item: Pick<Item, 'price' | 'costPrice'>): number {
  return item.costPrice > 0 ? ((item.price - item.costPrice) / item.costPrice) * 100 : 0;
}

export function normalizeSupplier(raw: Partial<Supplier>): Supplier {
  return {
    ...raw,
    id: String(raw.id || raw._id || '').trim(),
    name: raw.name || '',
    contact: raw.contact || raw.contactPerson || '',
    phone: raw.phone || '',
    email: raw.email || '',
    location: raw.location || raw.address || '',
    categories: raw.categories || raw.suppliedItems || '',
    notes: raw.notes || '',
    status: raw.status || 'active'
  };
}

export function serializeSupplier(supplier: Partial<Supplier>): Supplier {
  const normalized = normalizeSupplier(supplier);
  return {
    ...normalized,
    id: normalized.id || `SUP-${Date.now()}`,
    contactPerson: normalized.contact,
    address: normalized.location,
    suppliedItems: normalized.categories
  };
}

export function normalizePurchaseOrder(raw: Partial<PurchaseOrder>): PurchaseOrder {
  return {
    ...raw,
    id: String(raw.id || raw._id || '').trim(),
    supplierId: String(raw.supplierId || '').trim(),
    orderDate: raw.orderDate || raw.date || '',
    expectedDate: raw.expectedDate || raw.deliveryDate || '',
    items: raw.items || [],
    totalAmount: Number(raw.totalAmount ?? raw.cost ?? 0),
    cost: Number(raw.cost ?? raw.totalAmount ?? 0),
    status: raw.status || 'pending',
    notes: raw.notes || ''
  };
}

export function purchaseOrderItemsLabel(order: PurchaseOrder): string {
  if (Array.isArray(order.items)) {
    return order.items
      .map((item) => `${item.quantity || 1}x ${item.itemClass}`)
      .filter(Boolean)
      .join(', ');
  }
  return String(order.items || '');
}

export function serializePurchaseOrder(order: Partial<PurchaseOrder>): PurchaseOrder {
  const normalized = normalizePurchaseOrder(order);
  const rawItems = Array.isArray(normalized.items)
    ? normalized.items
    : String(normalized.items || '')
        .split(',')
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
          const match = chunk.match(/^(\d+)\s*x?\s*(.+)$/i);
          return {
            itemClass: match ? match[2].trim() : chunk,
            quantity: match ? Number(match[1]) || 1 : 1,
            total: 0
          };
        });

  return {
    ...normalized,
    id: normalized.id || Date.now().toString(),
    orderDate: normalized.orderDate || new Date().toISOString().slice(0, 10),
    expectedDate: normalized.expectedDate || '',
    items: rawItems,
    totalAmount: Number(normalized.totalAmount ?? normalized.cost ?? 0)
  };
}

export function normalizeDiscountRule(raw: Partial<DiscountRule>): DiscountRule {
  return {
    id: String(raw.id || raw._id || `DISC-${Date.now()}`).trim(),
    name: raw.name || '',
    type: raw.type || 'percentage',
    valueType: raw.valueType || 'fixed',
    value: Number(raw.value || 0),
    valueMin: Number(raw.valueMin || 0),
    valueMax: Number(raw.valueMax || 0),
    appliesTo: raw.appliesTo || 'all',
    minPurchase: Number(raw.minPurchase || 0),
    startDate: raw.startDate || '',
    endDate: raw.endDate || '',
    description: raw.description || '',
    active: raw.active !== false,
    createdAt: raw.createdAt,
    _id: raw._id
  };
}

export function isDiscountLive(rule: DiscountRule): boolean {
  if (!rule.active) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = rule.startDate ? new Date(`${rule.startDate}T00:00:00`) : null;
  const end = rule.endDate ? new Date(`${rule.endDate}T00:00:00`) : null;
  if (start && start > today) return false;
  if (end && end < today) return false;
  return true;
}

export function discountValueLabel(rule: DiscountRule): string {
  if (rule.type === 'bogo') return 'Buy 1 Get 1';
  if (rule.valueType === 'range') {
    return rule.type === 'percentage'
      ? `${rule.valueMin}% - ${rule.valueMax}%`
      : `${formatCurrency(rule.valueMin)} - ${formatCurrency(rule.valueMax)}`;
  }
  return rule.type === 'percentage' ? `${rule.value}%` : formatCurrency(rule.value);
}

export function loadPrinterSettings(): PrinterSettings {
  try {
    const stored = localStorage.getItem(PRINTER_SETTINGS_KEY);
    return normalizePrinterSettings(stored ? JSON.parse(stored) : DEFAULT_PRINTER_SETTINGS);
  } catch {
    return DEFAULT_PRINTER_SETTINGS;
  }
}

export function savePrinterSettings(settings: PrinterSettings): void {
  localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(normalizePrinterSettings(settings)));
}

export function parseCsvPreview(text: string): ImportPreview {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (!lines.length) return { headers: [], rows: [], totalRows: 0 };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((header) => header.toLowerCase());
  const rows = lines.slice(1, 11).map((line) => {
    const values = parseLine(line);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] || '';
      return acc;
    }, {});
  });

  return { headers, rows, totalRows: Math.max(0, lines.length - 1) };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
