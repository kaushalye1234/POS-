import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Barcode, ImagePlus, Printer, Save } from 'lucide-react';
import type { Item } from '../types';
import { generateStructuredBarcode, renderBarcodePng, saveItem, updateItem } from '../api';
import {
  buildLabelHtml,
  fileToDataUrl,
  formatCurrency,
  getErrorMessage,
  ITEM_SIZE_OPTIONS,
  inventorySkuFromId,
  labelCopyCount,
  loadPrinterSettings,
  makeItemLabelData,
  marginPercent,
  markupPercent,
  normalizeItem,
  normalizePrinterSettings
} from '../utils';
import { Button, Field, SelectInput, TextInput } from './Ui';

interface ProductFormProps {
  initialSku: string;
  item?: Item | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

interface ProductDraft {
  sku: string;
  name: string;
  category: string;
  size: string;
  stockLevel: string;
  costPrice: string;
  price: string;
  maxDiscountPercent: string;
  lowStockThreshold: string;
  criticalStockThreshold: string;
  barcode: string;
  imageUrl: string;
}

function toDraft(item: Item | null | undefined, initialSku: string): ProductDraft {
  return {
    sku: item?.sku || initialSku,
    name: item?.name || '',
    category: item?.category || 'Other',
    size: item?.size || '',
    stockLevel: String(item?.stockLevel ?? 0),
    costPrice: String(item?.costPrice ?? 0),
    price: String(item?.price ?? 0),
    maxDiscountPercent: String(item?.maxDiscountPercent ?? 30),
    lowStockThreshold: String(item?.lowStockThreshold ?? 10),
    criticalStockThreshold: String(item?.criticalStockThreshold ?? 3),
    barcode: item?.barcode || '',
    imageUrl: item?.imageUrl || ''
  };
}

function barcodeSymbology(text: string): 'ean13' | 'code128' {
  return /^\d{13}$/.test(text) ? 'ean13' : 'code128';
}

function barcodeDateCode(date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function categoryCode(category: string): string {
  const clean = category.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (clean || 'OTH').slice(0, 3).padEnd(3, 'X');
}

function priceBandCode(price: string): string {
  const value = Number(price || 0);
  const thresholds = [0, 1000, 2000, 5000, 10000, 20000];
  const band = thresholds.reduce((current, threshold, index) => (value >= threshold ? index : current), 0);
  return String(band).padStart(2, '0');
}

function localStructuredBarcode(sku: string, category: string, price: string): string {
  return `FS-${categoryCode(category)}-${priceBandCode(price)}-${barcodeDateCode()}-${sku}`;
}

export function ProductForm({ initialSku, item, onCancel, onSaved }: ProductFormProps): JSX.Element {
  const [draft, setDraft] = useState<ProductDraft>(() => toDraft(item, initialSku));
  const [saving, setSaving] = useState(false);
  const [barcodePreview, setBarcodePreview] = useState('');
  const [error, setError] = useState('');

  const normalizedPreview = useMemo(
    () =>
      normalizeItem({
        ...draft,
        price: Number(draft.price || 0),
        costPrice: Number(draft.costPrice || 0),
        stockLevel: Number(draft.stockLevel || 0),
        maxDiscountPercent: Number(draft.maxDiscountPercent || 0),
        lowStockThreshold: Number(draft.lowStockThreshold || 0),
        criticalStockThreshold: Number(draft.criticalStockThreshold || 0)
      }),
    [draft]
  );

  useEffect(() => {
    setDraft(toDraft(item, initialSku));
    setBarcodePreview('');
    setError('');
  }, [initialSku, item]);

  function updateDraft(field: keyof ProductDraft, value: string): void {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleItemNumberChange(value: string): void {
    const digits = value.replace(/\D/g, '');
    updateDraft('sku', digits ? inventorySkuFromId(digits) : '');
  }

  async function handleImage(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (selected.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB.');
      return;
    }
    updateDraft('imageUrl', await fileToDataUrl(selected));
  }

  async function handleGenerateBarcode(): Promise<void> {
    setError('');
    try {
      const sku = draft.sku.trim() || initialSku;
      if (!draft.sku.trim() && sku) updateDraft('sku', sku);

      let code = '';
      try {
        const response = await generateStructuredBarcode({
          sku,
          category: draft.category || 'Other',
          price: Number(draft.price || 0),
          storedAt: new Date().toISOString().slice(0, 10)
        });
        code = response.code;
      } catch {
        code = localStructuredBarcode(sku, draft.category || 'Other', draft.price);
      }

      updateDraft('barcode', code);
      const rendered = await renderBarcodePng(code, barcodeSymbology(code), 2, 10, true);
      setBarcodePreview(`data:${rendered.mime};base64,${rendered.data}`);
    } catch (generateError) {
      setError(getErrorMessage(generateError));
    }
  }

  async function handlePrintLabel(): Promise<void> {
    setError('');
    try {
      const textToEncode = draft.barcode || draft.sku;
      if (!textToEncode) throw new Error('Barcode or SKU is required before printing.');
      const settings = loadPrinterSettings();
      const rendered = await renderBarcodePng(textToEncode, barcodeSymbology(textToEncode), 2, 10, true);
      const normalizedSettings = normalizePrinterSettings(settings);
      const copies = labelCopyCount(normalizedPreview.stockLevel);
      const labelHtml = buildLabelHtml(
        normalizedSettings,
        makeItemLabelData(normalizedPreview, `data:${rendered.mime};base64,${rendered.data}`, textToEncode, normalizedSettings),
        copies
      );

      if (window.electronAPI?.printReceipt) {
        window.electronAPI.printReceipt(labelHtml, {
          printerName: normalizedSettings.printerName,
          landscape: normalizedSettings.printOrientation === 'landscape',
          preferCSSPageSize: true,
          margins: { marginType: 'none' },
          pageSize: {
            width: Math.round(normalizedSettings.labelWidth * 1000),
            height: Math.round(normalizedSettings.labelHeight * 1000)
          }
        });
      } else {
        const printWindow = window.open('', '_blank', 'width=420,height=640');
        if (!printWindow) throw new Error('Print window could not be opened.');
        printWindow.document.write(labelHtml);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }
    } catch (printError) {
      setError(getErrorMessage(printError));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = normalizeItem({
        sku: draft.sku.trim().toUpperCase(),
        name: draft.name.trim(),
        category: draft.category.trim() || 'Other',
        size: draft.size.trim(),
        stockLevel: Number(draft.stockLevel || 0),
        costPrice: Number(draft.costPrice || 0),
        price: Number(draft.price || 0),
        maxDiscountPercent: Number(draft.maxDiscountPercent || 0),
        lowStockThreshold: Number(draft.lowStockThreshold || 10),
        criticalStockThreshold: Number(draft.criticalStockThreshold || 3),
        barcode: draft.barcode.trim() || null,
        imageUrl: draft.imageUrl
      });

      if (!payload.sku) throw new Error('SKU is required.');
      if (!payload.name) throw new Error('Product name is required.');
      if (payload.price < 0 || payload.costPrice < 0 || payload.stockLevel < 0) {
        throw new Error('Price, cost, and stock cannot be negative.');
      }

      if (item) {
        await updateItem(item.sku, payload);
      } else {
        await saveItem(payload);
      }
      await onSaved();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="form-main">
        <div className="form-section">
          <h3>Product Identity</h3>
          <div className="grid two">
            <TextInput
              disabled={Boolean(item)}
              label="Item Number"
              onChange={(event) => handleItemNumberChange(event.target.value)}
              placeholder="1"
              value={draft.sku.replace(/^ITM-/i, '')}
            />
            <TextInput
              disabled={Boolean(item)}
              label="SKU"
              onChange={(event) => updateDraft('sku', event.target.value)}
              required
              value={draft.sku}
            />
          </div>
          <TextInput label="Product Name" onChange={(event) => updateDraft('name', event.target.value)} required value={draft.name} />
          <div className="grid two">
            <TextInput label="Category" onChange={(event) => updateDraft('category', event.target.value)} value={draft.category} />
            <SelectInput label="Size" onChange={(event) => updateDraft('size', event.target.value)} value={draft.size}>
              <option value="">Not set</option>
              {ITEM_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </SelectInput>
          </div>
        </div>

        <div className="form-section">
          <h3>Stock and Pricing</h3>
          <div className="grid three">
            <TextInput
              label="Cost Price"
              min="0"
              onChange={(event) => updateDraft('costPrice', event.target.value)}
              step="0.01"
              type="number"
              value={draft.costPrice}
            />
            <TextInput
              label="Selling Price"
              min="0"
              onChange={(event) => updateDraft('price', event.target.value)}
              required
              step="0.01"
              type="number"
              value={draft.price}
            />
            <TextInput
              label="Stock Level"
              min="0"
              onChange={(event) => updateDraft('stockLevel', event.target.value)}
              required
              type="number"
              value={draft.stockLevel}
            />
          </div>
          <div className="grid three">
            <TextInput
              label="Max Discount %"
              max="100"
              min="0"
              onChange={(event) => updateDraft('maxDiscountPercent', event.target.value)}
              type="number"
              value={draft.maxDiscountPercent}
            />
            <TextInput
              label="Low Stock Threshold"
              min="0"
              onChange={(event) => updateDraft('lowStockThreshold', event.target.value)}
              type="number"
              value={draft.lowStockThreshold}
            />
            <TextInput
              label="Critical Threshold"
              min="0"
              onChange={(event) => updateDraft('criticalStockThreshold', event.target.value)}
              type="number"
              value={draft.criticalStockThreshold}
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Barcode and Label</h3>
          <div className="split-line">
            <TextInput label="Barcode" onChange={(event) => updateDraft('barcode', event.target.value)} value={draft.barcode} />
            <Button onClick={handleGenerateBarcode} type="button">
              <Barcode aria-hidden="true" size={16} />
              Generate
            </Button>
            <Button onClick={handlePrintLabel} type="button">
              <Printer aria-hidden="true" size={16} />
              Print
            </Button>
          </div>
          {barcodePreview ? <img alt="Generated barcode preview" className="barcode-preview" src={barcodePreview} /> : null}
        </div>
      </div>

      <aside className="form-side">
        <div className="image-picker">
          {draft.imageUrl ? <img alt={`${draft.name || 'Product'} preview`} src={draft.imageUrl} /> : <ImagePlus aria-hidden="true" size={34} />}
          <Field label="Product Image">
            <input accept="image/*" onChange={handleImage} type="file" />
          </Field>
        </div>

        <div className="calc-panel">
          <span>Markup</span>
          <strong>{markupPercent(normalizedPreview).toFixed(1)}%</strong>
          <span>Margin</span>
          <strong>{marginPercent(normalizedPreview).toFixed(1)}%</strong>
          <span>Unit Profit</span>
          <strong>{formatCurrency(normalizedPreview.price - normalizedPreview.costPrice)}</strong>
        </div>

        {error ? (
          <div className="notice danger">
            <span>{error}</span>
          </div>
        ) : null}

        <div className="button-row end">
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
          <Button loading={saving} type="submit" variant="primary">
            <Save aria-hidden="true" size={16} />
            Save Product
          </Button>
        </div>
      </aside>
    </form>
  );
}
