import { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, RefreshCw, RotateCcw, ServerCog } from 'lucide-react';
import type { ElectronDiagnostics, HealthResponse, Item } from '../types';
import { getElectronDiagnostics, getHealth, getItems, rebuildCashierItemsCache, runMongoSync } from '../api';
import { formatCurrency, getErrorMessage } from '../utils';
import { Button, EmptyState, Metric } from './Ui';

interface Mismatch {
  sku: string;
  name: string;
  cachePrice: string;
  remotePrice: string;
  reason: string;
}

export function Diagnostics(): JSX.Element {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<ElectronDiagnostics>({ pendingSalesCount: 0, cachedItemsCount: 0, cachedItems: [] });
  const [remoteItems, setRemoteItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');

  async function loadDiagnostics(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const [healthData, localData, itemData] = await Promise.all([getHealth().catch(() => null), getElectronDiagnostics(), getItems().catch(() => [])]);
      setHealth(healthData);
      setDiagnostics(localData);
      setRemoteItems(itemData);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDiagnostics();
  }, []);

  const mismatches = useMemo(() => detectMismatches(diagnostics.cachedItems, remoteItems), [diagnostics.cachedItems, remoteItems]);

  async function handleRunSync(): Promise<void> {
    setWorking('sync');
    setError('');
    try {
      await runMongoSync();
      await loadDiagnostics();
    } catch (syncError) {
      setError(getErrorMessage(syncError));
    } finally {
      setWorking('');
    }
  }

  async function handleRebuildCache(): Promise<void> {
    if (!window.confirm('Rebuild the cashier POS item cache from current MongoDB items?')) return;
    setWorking('cache');
    setError('');
    try {
      const ok = await rebuildCashierItemsCache(remoteItems);
      if (!ok) throw new Error('Cache rebuild is available only inside Electron.');
      await loadDiagnostics();
    } catch (cacheError) {
      setError(getErrorMessage(cacheError));
    } finally {
      setWorking('');
    }
  }

  return (
    <section className="view-stack">
      <div className="action-band">
        <div>
          <p className="eyebrow">API and cache diagnostics</p>
          <h2>Database Health</h2>
        </div>
        <div className="button-row">
          <Button loading={loading} onClick={loadDiagnostics} type="button">
            <RefreshCw aria-hidden="true" size={16} />
            Refresh
          </Button>
          <Button loading={working === 'sync'} onClick={handleRunSync} type="button">
            <ServerCog aria-hidden="true" size={16} />
            Run Sync
          </Button>
          <Button loading={working === 'cache'} onClick={handleRebuildCache} type="button" variant="primary">
            <RotateCcw aria-hidden="true" size={16} />
            Rebuild Cache
          </Button>
        </div>
      </div>

      {error ? <div className="notice danger">{error}</div> : null}

      <div className="metric-grid">
        <Metric
          detail={health?.database.activeSource || 'unavailable'}
          label="API Status"
          tone={health?.database.ready ? 'good' : 'danger'}
          value={health?.database.ready ? 'Online' : 'Offline'}
        />
        <Metric detail="Cashier queue" label="Pending Sales" tone={diagnostics.pendingSalesCount ? 'warn' : 'good'} value={String(diagnostics.pendingSalesCount)} />
        <Metric label="Cached Items" value={String(diagnostics.cachedItemsCount)} />
        <Metric label="Mismatches" tone={mismatches.length ? 'warn' : 'good'} value={String(mismatches.length)} />
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Cache to MongoDB comparison</p>
            <h3>Mismatch Inspector</h3>
          </div>
          <DatabaseZap aria-hidden="true" size={20} />
        </div>
        {mismatches.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Cache Price</th>
                  <th>Mongo Price</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {mismatches.map((entry) => (
                  <tr key={`${entry.sku}-${entry.reason}`}>
                    <td className="mono">{entry.sku}</td>
                    <td>{entry.name}</td>
                    <td>{entry.cachePrice}</td>
                    <td>{entry.remotePrice}</td>
                    <td>{entry.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No cache mismatches detected" />
        )}
      </section>
    </section>
  );
}

function detectMismatches(cached: Item[], remote: Item[]): Mismatch[] {
  const mismatches: Mismatch[] = [];
  const cacheMap = new Map(cached.map((item) => [item.sku, item]));
  const remoteMap = new Map(remote.map((item) => [item.sku, item]));

  remote.forEach((remoteItem) => {
    const cachedItem = cacheMap.get(remoteItem.sku);
    if (!cachedItem) {
      mismatches.push({
        sku: remoteItem.sku,
        name: remoteItem.name,
        cachePrice: '-',
        remotePrice: formatCurrency(remoteItem.price),
        reason: 'Missing in cashier cache'
      });
      return;
    }

    const reasons: string[] = [];
    if (remoteItem.price !== cachedItem.price) reasons.push('Price');
    if (remoteItem.costPrice !== cachedItem.costPrice) reasons.push('Cost');
    if (remoteItem.name !== cachedItem.name) reasons.push('Name');

    if (reasons.length) {
      mismatches.push({
        sku: remoteItem.sku,
        name: remoteItem.name,
        cachePrice: formatCurrency(cachedItem.price),
        remotePrice: formatCurrency(remoteItem.price),
        reason: `${reasons.join(', ')} mismatch`
      });
    }
  });

  cached.forEach((cachedItem) => {
    if (!remoteMap.has(cachedItem.sku)) {
      mismatches.push({
        sku: cachedItem.sku,
        name: cachedItem.name,
        cachePrice: formatCurrency(cachedItem.price),
        remotePrice: '-',
        reason: 'Cached item missing in MongoDB'
      });
    }
  });

  return mismatches;
}
