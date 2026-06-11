import { AlertTriangle, Boxes, Plus, RefreshCw, TrendingUp } from 'lucide-react';
import type { Item } from '../types';
import type { ViewKey } from './Layout';
import { formatCurrency, itemStatus, marginPercent } from '../utils';
import { Button, EmptyState, Metric } from './Ui';

interface OverviewProps {
  items: Item[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onViewChange: (view: ViewKey) => void;
}

export function Overview({ items, loading, onRefresh, onViewChange }: OverviewProps): JSX.Element {
  const inventoryValue = items.reduce((sum, item) => sum + item.costPrice * item.stockLevel, 0);
  const retailValue = items.reduce((sum, item) => sum + item.price * item.stockLevel, 0);
  const lowItems = items.filter((item) => itemStatus(item) !== 'healthy');
  const averageMargin = items.length ? items.reduce((sum, item) => sum + marginPercent(item), 0) / items.length : 0;
  const topStock = [...items].sort((left, right) => right.stockLevel - left.stockLevel).slice(0, 6);
  const criticalItems = lowItems.filter((item) => itemStatus(item) === 'critical');

  return (
    <section className="view-stack">
      <div className="action-band">
        <div>
          <p className="eyebrow">Current catalog snapshot</p>
          <h2>Stock room command center</h2>
        </div>
        <div className="button-row">
          <Button loading={loading} onClick={onRefresh} type="button">
            <RefreshCw aria-hidden="true" size={16} />
            Refresh
          </Button>
          <Button onClick={() => onViewChange('inventory')} type="button" variant="primary">
            <Plus aria-hidden="true" size={16} />
            New Product
          </Button>
        </div>
      </div>

      <div className="metric-grid">
        <Metric detail={`${items.length.toLocaleString()} products`} label="Cost Value" value={formatCurrency(inventoryValue)} />
        <Metric detail="Stock at selling price" label="Retail Value" value={formatCurrency(retailValue)} />
        <Metric
          detail={`${criticalItems.length} critical`}
          label="Restock Queue"
          tone={lowItems.length ? 'warn' : 'good'}
          value={lowItems.length.toLocaleString()}
        />
        <Metric detail="Catalog average" label="Gross Margin" tone={averageMargin >= 25 ? 'good' : 'warn'} value={`${averageMargin.toFixed(1)}%`} />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Highest quantities</p>
              <h3>Stock Distribution</h3>
            </div>
            <Boxes aria-hidden="true" size={20} />
          </div>
          {topStock.length ? (
            <div className="bar-list">
              {topStock.map((item) => {
                const maxStock = Math.max(...topStock.map((entry) => entry.stockLevel), 1);
                return (
                  <div className="bar-row" key={item.sku}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.sku}</span>
                    </div>
                    <div className="bar-track">
                      <span style={{ width: `${Math.max(8, (item.stockLevel / maxStock) * 100)}%` }} />
                    </div>
                    <em>{item.stockLevel}</em>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No inventory loaded" />
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Restock signals</p>
              <h3>Low Stock Watch</h3>
            </div>
            <AlertTriangle aria-hidden="true" size={20} />
          </div>
          {lowItems.length ? (
            <div className="compact-list">
              {lowItems.slice(0, 8).map((item) => (
                <article className={`status-line ${itemStatus(item)}`} key={item.sku}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.category}</span>
                  </div>
                  <span>{item.stockLevel}</span>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="All stock levels are above threshold" />
          )}
        </section>

        <section className="panel wide-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Margin scan</p>
              <h3>Price Health</h3>
            </div>
            <TrendingUp aria-hidden="true" size={20} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Cost</th>
                  <th>Price</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {[...items]
                  .sort((left, right) => marginPercent(left) - marginPercent(right))
                  .slice(0, 8)
                  .map((item) => (
                    <tr key={item.sku}>
                      <td className="mono">{item.sku}</td>
                      <td>{item.name}</td>
                      <td>{item.category}</td>
                      <td>{formatCurrency(item.costPrice)}</td>
                      <td>{formatCurrency(item.price)}</td>
                      <td>
                        <span className={`badge ${marginPercent(item) >= 20 ? 'good' : 'warn'}`}>{marginPercent(item).toFixed(1)}%</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
