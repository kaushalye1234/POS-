import { useEffect, useState } from 'react';
import { Activity, Barcode, Calendar, PackageCheck } from 'lucide-react';
import type { InventoryTransaction, Item } from '../types';
import { getItemTransactions, renderBarcodePng } from '../api';
import { formatCurrency, formatDate, getErrorMessage, itemStatus } from '../utils';
import { EmptyState, Metric, Modal } from './Ui';

interface ItemDetailsProps {
  item: Item;
  onClose: () => void;
}

export function ItemDetails({ item, onClose }: ItemDetailsProps): JSX.Element {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [barcodePreview, setBarcodePreview] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadDetails(): Promise<void> {
      setError('');
      try {
        const [audit, rendered] = await Promise.all([
          getItemTransactions(item.sku).catch(() => []),
          item.barcode ? renderBarcodePng(item.barcode).catch(() => null) : Promise.resolve(null)
        ]);
        if (!cancelled) {
          setTransactions(audit);
          setBarcodePreview(rendered ? `data:${rendered.mime};base64,${rendered.data}` : '');
        }
      } catch (detailError) {
        if (!cancelled) setError(getErrorMessage(detailError));
      }
    }
    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [item]);

  return (
    <Modal onClose={onClose} title={`${item.sku} Audit`} wide>
      <div className="details-grid">
        <section className="panel flat">
          <div className="detail-hero">
            {item.imageUrl ? <img alt={item.name} src={item.imageUrl} /> : <PackageCheck aria-hidden="true" size={36} />}
            <div>
              <h3>{item.name}</h3>
              <p>{[item.category, item.size ? `Size ${item.size}` : ''].filter(Boolean).join(' / ')}</p>
              <span className={`badge ${itemStatus(item)}`}>{itemStatus(item)}</span>
            </div>
          </div>
          <div className="metric-grid compact">
            <Metric label="Stock" value={String(item.stockLevel)} />
            <Metric label="Size" value={item.size || '-'} />
            <Metric label="Selling Price" value={formatCurrency(item.price)} />
            <Metric label="Cost Price" value={formatCurrency(item.costPrice)} />
            <Metric label="Max Discount" value={`${item.maxDiscountPercent}%`} />
          </div>
          <div className="info-list">
            <span>
              <Calendar aria-hidden="true" size={16} />
              Stored {formatDate(item.storedAt || item.createdAt)}
            </span>
            <span>
              <Barcode aria-hidden="true" size={16} />
              {item.barcode || 'No barcode'}
            </span>
          </div>
          {barcodePreview ? <img alt="Barcode preview" className="barcode-preview" src={barcodePreview} /> : null}
        </section>

        <section className="panel flat">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Inventory transactions</p>
              <h3>Audit Trail</h3>
            </div>
            <Activity aria-hidden="true" size={20} />
          </div>
          {error ? <div className="notice danger">{error}</div> : null}
          {transactions.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Previous</th>
                    <th>New</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((entry) => (
                    <tr key={entry._id || entry.id || `${entry.sku}-${entry.createdAt}`}>
                      <td>{formatDate(entry.createdAt)}</td>
                      <td>{entry.type || entry.source || '-'}</td>
                      <td>{entry.quantity ?? '-'}</td>
                      <td>{entry.previousStock ?? '-'}</td>
                      <td>{entry.newStock ?? '-'}</td>
                      <td>{entry.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No audit transactions found" />
          )}
        </section>
      </div>
    </Modal>
  );
}
