import { ChangeEvent, useMemo, useState } from 'react';
import { Eye, FileUp, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { ImportPreview, Item } from '../types';
import { deleteItem, importItems } from '../api';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  getErrorMessage,
  itemStatus,
  parseCsvPreview,
  parseNumericIdFromSku
} from '../utils';
import { Button, EmptyState, Metric, Modal, SelectInput, TextInput } from './Ui';
import { ProductForm } from './ProductForm';
import { ItemDetails } from './ItemDetails';

interface InventoryProps {
  items: Item[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

type StockFilter = 'all' | 'healthy' | 'low' | 'critical';

export function Inventory({ items, loading, onRefresh }: InventoryProps): JSX.Element {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [detailsItem, setDetailsItem] = useState<Item | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map((item) => item.category || 'Other'))).sort()], [items]);
  const nextSku = useMemo(() => {
    const maxId = items.reduce((max, item) => {
      const id = parseNumericIdFromSku(item.sku);
      return id && id > max ? id : max;
    }, 0);
    return `ITM-${maxId + 1}`;
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.toLowerCase().trim();
    return [...items]
      .filter((item) => {
        if (category !== 'all' && item.category !== category) return false;
        if (stockFilter !== 'all' && itemStatus(item) !== stockFilter) return false;
        if (!query) return true;
        return [item.sku, item.name, item.category, item.size || '', item.barcode || ''].join(' ').toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftId = parseNumericIdFromSku(left.sku);
        const rightId = parseNumericIdFromSku(right.sku);
        if (leftId !== null && rightId !== null) return leftId - rightId;
        return left.sku.localeCompare(right.sku);
      });
  }, [category, items, search, stockFilter]);

  const totals = useMemo(
    () => ({
      stock: items.reduce((sum, item) => sum + item.stockLevel, 0),
      retail: items.reduce((sum, item) => sum + item.stockLevel * item.price, 0),
      low: items.filter((item) => itemStatus(item) !== 'healthy').length
    }),
    [items]
  );

  async function handleCsvSelected(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setPreview(parseCsvPreview(text));
  }

  async function handleImport(): Promise<void> {
    if (!csvText) return;
    setImporting(true);
    setError('');
    try {
      await importItems(csvText);
      setCsvText('');
      setPreview(null);
      await onRefresh();
    } catch (importError) {
      setError(getErrorMessage(importError));
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(item: Item): Promise<void> {
    if (!window.confirm(`Delete ${item.sku} (${item.name})?`)) return;
    setError('');
    try {
      await deleteItem(item.sku);
      await onRefresh();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    }
  }

  function openForm(item: Item | null): void {
    setEditingItem(item);
    setShowProductForm(true);
  }

  async function handleSaved(): Promise<void> {
    setShowProductForm(false);
    setEditingItem(null);
    await onRefresh();
  }

  return (
    <section className="view-stack">
      <div className="action-band">
        <div>
          <p className="eyebrow">Product catalog</p>
          <h2>{filteredItems.length.toLocaleString()} visible SKUs</h2>
        </div>
        <div className="button-row">
          <Button loading={loading} onClick={onRefresh} type="button">
            <RefreshCw aria-hidden="true" size={16} />
            Refresh
          </Button>
          <Button onClick={() => openForm(null)} type="button" variant="primary">
            <Plus aria-hidden="true" size={16} />
            Add Product
          </Button>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Products" value={formatNumber(items.length)} />
        <Metric label="Units On Hand" value={formatNumber(totals.stock)} />
        <Metric label="Retail Value" value={formatCurrency(totals.retail)} />
        <Metric label="Restock Items" tone={totals.low ? 'warn' : 'good'} value={formatNumber(totals.low)} />
      </div>

      {error ? <div className="notice danger">{error}</div> : null}

      <section className="panel">
        <div className="toolbar">
          <div className="search-box">
            <Search aria-hidden="true" size={18} />
            <input aria-label="Search inventory" onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, name, size, barcode" value={search} />
          </div>
          <SelectInput label="Category" onChange={(event) => setCategory(event.target.value)} value={category}>
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {entry === 'all' ? 'All categories' : entry}
              </option>
            ))}
          </SelectInput>
          <SelectInput label="Stock" onChange={(event) => setStockFilter(event.target.value as StockFilter)} value={stockFilter}>
            <option value="all">All stock</option>
            <option value="healthy">Healthy</option>
            <option value="low">Low</option>
            <option value="critical">Critical</option>
          </SelectInput>
        </div>

        <div className="csv-import">
          <label className="file-button">
            <FileUp aria-hidden="true" size={16} />
            <span>Import CSV</span>
            <input accept=".csv,text/csv" onChange={handleCsvSelected} type="file" />
          </label>
          {preview ? (
            <div className="preview-strip">
              <span>{preview.totalRows.toLocaleString()} rows</span>
              <span>{preview.headers.join(', ')}</span>
              <Button loading={importing} onClick={handleImport} type="button" variant="primary">
                Import
              </Button>
            </div>
          ) : null}
        </div>

        <div className="table-wrap">
          {filteredItems.length ? (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Stored</th>
                  <th>Barcode</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.sku}>
                    <td className="mono">{item.sku}</td>
                    <td>
                      <div className="product-cell">
                        {item.imageUrl ? <img alt={item.name} src={item.imageUrl} /> : <span>{item.name.slice(0, 2).toUpperCase()}</span>}
                        <strong>{item.name}</strong>
                      </div>
                    </td>
                    <td>{item.category}</td>
                    <td>{item.size || '-'}</td>
                    <td>{formatCurrency(item.price)}</td>
                    <td>
                      <span className={`badge ${itemStatus(item)}`}>{item.stockLevel}</span>
                    </td>
                    <td>{formatDate(item.storedAt || item.createdAt)}</td>
                    <td className="mono truncate">{item.barcode || '-'}</td>
                    <td>
                      <div className="icon-row">
                        <button aria-label={`View ${item.name}`} onClick={() => setDetailsItem(item)} type="button">
                          <Eye aria-hidden="true" size={16} />
                        </button>
                        <button aria-label={`Edit ${item.name}`} onClick={() => openForm(item)} type="button">
                          <Pencil aria-hidden="true" size={16} />
                        </button>
                        <button aria-label={`Delete ${item.name}`} onClick={() => void handleDelete(item)} type="button">
                          <Trash2 aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState body="Adjust filters or add the first product." title="No matching products" />
          )}
        </div>
      </section>

      {showProductForm ? (
        <Modal onClose={() => setShowProductForm(false)} title={editingItem ? `Edit ${editingItem.sku}` : 'Add Product'} wide>
          <ProductForm initialSku={nextSku} item={editingItem} onCancel={() => setShowProductForm(false)} onSaved={handleSaved} />
        </Modal>
      ) : null}

      {detailsItem ? <ItemDetails item={detailsItem} onClose={() => setDetailsItem(null)} /> : null}
    </section>
  );
}
