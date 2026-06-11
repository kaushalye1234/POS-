import { useCallback, useEffect, useState } from 'react';
import type { AuthUser, Item } from './types';
import { getItems, isAuthenticated, loadSecureToken, logoutUser, setApiOrigin } from './api';
import { getErrorMessage } from './utils';
import { Analytics } from './components/Analytics';
import { AuthScreen } from './components/AuthScreen';
import { Diagnostics } from './components/Diagnostics';
import { Discounts } from './components/Discounts';
import { Inventory } from './components/Inventory';
import { Layout, type ViewKey } from './components/Layout';
import { Overview } from './components/Overview';
import { Printers } from './components/Printers';
import { Suppliers } from './components/Suppliers';
import { Users } from './components/Users';

export function App(): JSX.Element {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('overview');
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const refreshItems = useCallback(async () => {
    if (!isAuthenticated()) return;
    setItemsLoading(true);
    setGlobalError('');
    try {
      setItems(await getItems());
    } catch (error) {
      setGlobalError(getErrorMessage(error));
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const hydrateSession = useCallback(async () => {
    setBooting(true);
    await loadSecureToken();
    const rawUser = localStorage.getItem('pos_auth_user');
    const storedUser = rawUser ? (JSON.parse(rawUser) as AuthUser) : null;
    const canEnter = isAuthenticated() && storedUser && ['admin', 'manager'].includes(storedUser.role);
    setUser(canEnter ? storedUser : null);
    setBooting(false);
  }, []);

  useEffect(() => {
    hydrateSession().catch((error) => {
      setGlobalError(getErrorMessage(error));
      setBooting(false);
    });
  }, [hydrateSession]);

  useEffect(() => {
    if (user) void refreshItems();
  }, [refreshItems, user]);

  useEffect(() => {
    const listener = () => {
      setUser(null);
      setActiveView('overview');
    };
    window.addEventListener('stock-auth-expired', listener);
    return () => window.removeEventListener('stock-auth-expired', listener);
  }, []);

  async function handleAuthenticated(sessionUser: AuthUser): Promise<void> {
    setUser(sessionUser);
    setActiveView('overview');
    await refreshItems();
  }

  async function handleLogout(): Promise<void> {
    await logoutUser();
    setUser(null);
    setActiveView('overview');
    setItems([]);
  }

  function handleApiOriginChange(origin: string): void {
    try {
      setApiOrigin(origin);
      void refreshItems();
    } catch (error) {
      setGlobalError(getErrorMessage(error));
    }
  }

  if (booting) {
    return (
      <div className="boot-screen">
        <div className="brand-mark">FS</div>
        <p>Loading stock console</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <Layout
      activeView={activeView}
      itemCount={items.length}
      onApiOriginChange={handleApiOriginChange}
      onLogout={handleLogout}
      onViewChange={setActiveView}
      user={user}
    >
      {globalError ? (
        <div className="notice danger">
          <strong>Connection issue</strong>
          <span>{globalError}</span>
        </div>
      ) : null}

      {activeView === 'overview' ? (
        <Overview items={items} loading={itemsLoading} onRefresh={refreshItems} onViewChange={setActiveView} />
      ) : null}
      {activeView === 'inventory' ? <Inventory items={items} loading={itemsLoading} onRefresh={refreshItems} /> : null}
      {activeView === 'analytics' ? <Analytics /> : null}
      {activeView === 'suppliers' ? <Suppliers /> : null}
      {activeView === 'discounts' ? <Discounts /> : null}
      {activeView === 'users' ? <Users currentUser={user} /> : null}
      {activeView === 'database' ? <Diagnostics /> : null}
      {activeView === 'printers' ? <Printers /> : null}
    </Layout>
  );
}
