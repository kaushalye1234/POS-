import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';
import type { AdvancedAnalytics as AdvancedAnalyticsType } from '../types';
import { getAdvancedAnalytics } from '../api';
import { formatCurrency, formatNumber, getErrorMessage } from '../utils';
import { Button, EmptyState, Metric } from './Ui';

export function Analytics(): JSX.Element {
  const [data, setData] = useState<AdvancedAnalyticsType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  async function loadAnalytics(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      setData(await getAdvancedAnalytics());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalytics();
  }, []);

  const abcTotals = useMemo(() => {
    const totals = { A: 0, B: 0, C: 0 };
    data?.items.forEach((item) => {
      totals[item.abcCategory] += item.revenue;
    });
    return totals;
  }, [data]);

  const filteredItems = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!data) return [];
    return data.items.filter((item) => [item.sku, item.name, item.category].join(' ').toLowerCase().includes(term));
  }, [data, query]);

  if (error) {
    return (
      <section className="view-stack">
        <div className="notice danger">{error}</div>
        <Button loading={loading} onClick={loadAnalytics} type="button">
          <RefreshCw aria-hidden="true" size={16} />
          Retry
        </Button>
      </section>
    );
  }

  return (
    <section className="view-stack">
      <div className="action-band">
        <div>
          <p className="eyebrow">Advanced stock metrics</p>
          <h2>Inventory Performance</h2>
        </div>
        <Button loading={loading} onClick={loadAnalytics} type="button">
          <RefreshCw aria-hidden="true" size={16} />
          Refresh
        </Button>
      </div>

      <div className="metric-grid">
        <Metric label="Inventory Value" value={formatCurrency(data?.inventoryMetrics.currentInventoryValue)} />
        <Metric detail="30-day COGS / current value" label="ITR" value={(data?.inventoryMetrics.itr || 0).toFixed(2)} />
        <Metric
          detail="30-day stock coverage"
          label="DSI"
          tone={(data?.inventoryMetrics.dsi || 0) > 90 ? 'warn' : 'good'}
          value={(data?.inventoryMetrics.dsi || 0) >= 9999 ? 'N/A' : `${(data?.inventoryMetrics.dsi || 0).toFixed(1)} days`}
        />
        <Metric label="GMROI" tone={(data?.inventoryMetrics.gmroi || 0) > 0 ? 'good' : 'warn'} value={(data?.inventoryMetrics.gmroi || 0).toFixed(2)} />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Financials</p>
              <h3>Profit Mix</h3>
            </div>
            <BarChart3 aria-hidden="true" size={20} />
          </div>
          <div className="metric-grid compact">
            <Metric label="Revenue" value={formatCurrency(data?.financials.totalRevenue)} />
            <Metric label="Cost" value={formatCurrency(data?.financials.totalCost)} />
            <Metric label="Gross Profit" tone="good" value={formatCurrency(data?.financials.totalGrossProfit)} />
            <Metric label="Net Margin" value={`${(data?.financials.netProfitMargin || 0).toFixed(1)}%`} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ABC revenue split</p>
              <h3>Pareto Classes</h3>
            </div>
            <Activity aria-hidden="true" size={20} />
          </div>
          <div className="abc-bars">
            {(['A', 'B', 'C'] as const).map((key) => {
              const total = Object.values(abcTotals).reduce((sum, value) => sum + value, 0) || 1;
              return (
                <div className={`abc-row class-${key}`} key={key}>
                  <span>Class {key}</span>
                  <div className="bar-track">
                    <span style={{ width: `${Math.max(4, (abcTotals[key] / total) * 100)}%` }} />
                  </div>
                  <strong>{formatCurrency(abcTotals[key])}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Restock alerts</p>
              <h3>Action Queue</h3>
            </div>
            <AlertTriangle aria-hidden="true" size={20} />
          </div>
          {data && (data.alerts.criticalRestock.length || data.alerts.lowStock.length) ? (
            <div className="compact-list">
              {[...data.alerts.criticalRestock, ...data.alerts.lowStock].slice(0, 10).map((item) => (
                <article className={`status-line ${item.stockLevel <= item.threshold ? 'critical' : 'low'}`} key={item.sku}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.sku} · limit {item.threshold}
                    </span>
                  </div>
                  <span>{item.stockLevel}</span>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No restock alerts" />
          )}
        </section>

        <section className="panel wide-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">SKU velocity</p>
              <h3>Product Performance</h3>
            </div>
            <input aria-label="Search analytics rows" onChange={(event) => setQuery(event.target.value)} placeholder="Search performance rows" value={query} />
          </div>
          <div className="table-wrap">
            {filteredItems.length ? (
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Revenue</th>
                    <th>Profit</th>
                    <th>Units</th>
                    <th>7D Vel.</th>
                    <th>30D Vel.</th>
                    <th>ABC</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.sku}>
                      <td className="mono">{item.sku}</td>
                      <td>{item.name}</td>
                      <td>{formatCurrency(item.revenue)}</td>
                      <td>{formatCurrency(item.profit)}</td>
                      <td>{formatNumber(item.units)}</td>
                      <td>{item.velocity7.toFixed(2)}</td>
                      <td>{item.velocity30.toFixed(2)}</td>
                      <td>
                        <span className={`badge abc-${item.abcCategory}`}>{item.abcCategory}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No analytics rows" />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
