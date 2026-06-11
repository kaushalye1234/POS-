import {
  BarChart3,
  Boxes,
  DatabaseZap,
  LayoutDashboard,
  LogOut,
  Percent,
  Printer,
  RefreshCw,
  Truck,
  UsersRound
} from 'lucide-react';
import type { PropsWithChildren } from 'react';
import type { AuthUser } from '../types';
import { getApiOrigin } from '../api';
import { Button } from './Ui';

export type ViewKey = 'overview' | 'inventory' | 'analytics' | 'suppliers' | 'discounts' | 'users' | 'database' | 'printers';

interface LayoutProps extends PropsWithChildren {
  activeView: ViewKey;
  itemCount: number;
  onApiOriginChange: (origin: string) => void;
  onLogout: () => Promise<void>;
  onViewChange: (view: ViewKey) => void;
  user: AuthUser;
}

const navItems = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'inventory', label: 'Inventory', icon: Boxes },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'suppliers', label: 'Suppliers', icon: Truck },
  { key: 'discounts', label: 'Discounts', icon: Percent },
  { key: 'users', label: 'Users', icon: UsersRound },
  { key: 'database', label: 'Database', icon: DatabaseZap },
  { key: 'printers', label: 'Printers', icon: Printer }
] as const;

export function Layout({
  activeView,
  children,
  itemCount,
  onApiOriginChange,
  onLogout,
  onViewChange,
  user
}: LayoutProps): JSX.Element {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-stack">
          <div className="brand-mark">FS</div>
          <div>
            <h1>Fashion Shaa</h1>
            <p>Stock Console</p>
          </div>
        </div>

        <nav aria-label="Stock management sections" className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={activeView === item.key ? 'page' : undefined}
                key={item.key}
                onClick={() => onViewChange(item.key)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span>{itemCount.toLocaleString()} SKUs</span>
          <Button onClick={onLogout} type="button" variant="ghost">
            <LogOut aria-hidden="true" size={16} />
            Sign Out
          </Button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Admin and inventory operations</p>
            <h2>{navItems.find((item) => item.key === activeView)?.label || 'Stock Console'}</h2>
          </div>
          <div className="topbar-actions">
            <label className="api-origin">
              <span>API</span>
              <input
                defaultValue={getApiOrigin()}
                onBlur={(event) => onApiOriginChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onApiOriginChange(event.currentTarget.value);
                }}
              />
            </label>
            <div className="user-pill">
              <RefreshCw aria-hidden="true" size={14} />
              <strong>{user.username}</strong>
              <span>{user.role}</span>
            </div>
          </div>
        </header>
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
