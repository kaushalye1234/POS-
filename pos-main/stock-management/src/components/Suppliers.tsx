import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, Search, Trash2, Truck } from 'lucide-react';
import type { PurchaseOrder, Supplier } from '../types';
import {
  deleteSupplierRecord,
  getPurchaseOrders,
  getSuppliers,
  savePurchaseOrderRecord,
  saveSupplierRecord
} from '../api';
import { formatCurrency, formatDate, getErrorMessage, purchaseOrderItemsLabel } from '../utils';
import { Button, EmptyState, Modal, SelectInput, TextInput } from './Ui';

export function Suppliers(): JSX.Element {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [tab, setTab] = useState<'suppliers' | 'orders'>('suppliers');
  const [query, setQuery] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadAll(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const [supplierData, orderData] = await Promise.all([getSuppliers(), getPurchaseOrders()]);
      setSuppliers(supplierData);
      setOrders(orderData);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const filteredSuppliers = useMemo(() => {
    const term = query.toLowerCase().trim();
    return suppliers.filter((supplier) =>
      [supplier.name, supplier.contact, supplier.phone, supplier.categories, supplier.location].join(' ').toLowerCase().includes(term)
    );
  }, [query, suppliers]);

  const filteredOrders = useMemo(() => {
    const term = query.toLowerCase().trim();
    return orders.filter((order) => {
      const supplier = suppliers.find((entry) => entry.id === order.supplierId);
      return [order.id, supplier?.name, purchaseOrderItemsLabel(order), order.status].join(' ').toLowerCase().includes(term);
    });
  }, [orders, query, suppliers]);

  async function handleDeleteSupplier(supplier: Supplier): Promise<void> {
    if (!window.confirm(`Delete supplier ${supplier.name}?`)) return;
    setError('');
    try {
      await deleteSupplierRecord(supplier.id);
      await loadAll();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    }
  }

  async function markReceived(order: PurchaseOrder): Promise<void> {
    await savePurchaseOrderRecord({ ...order, status: 'received' });
    await loadAll();
  }

  return (
    <section className="view-stack">
      <div className="action-band">
        <div>
          <p className="eyebrow">Supplier network</p>
          <h2>{tab === 'suppliers' ? 'Vendor Directory' : 'Purchase Orders'}</h2>
        </div>
        <div className="button-row">
          <Button loading={loading} onClick={loadAll} type="button">
            <RefreshCw aria-hidden="true" size={16} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setEditingSupplier(null);
              setShowSupplierModal(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Supplier
          </Button>
          <Button onClick={() => setShowOrderModal(true)} type="button" variant="primary">
            <Truck aria-hidden="true" size={16} />
            Purchase Order
          </Button>
        </div>
      </div>

      {error ? <div className="notice danger">{error}</div> : null}

      <section className="panel">
        <div className="toolbar">
          <div className="segmented">
            <button aria-pressed={tab === 'suppliers'} onClick={() => setTab('suppliers')} type="button">
              Suppliers
            </button>
            <button aria-pressed={tab === 'orders'} onClick={() => setTab('orders')} type="button">
              Orders
            </button>
          </div>
          <div className="search-box">
            <Search aria-hidden="true" size={18} />
            <input aria-label="Search suppliers and orders" onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers or orders" value={query} />
          </div>
        </div>

        {tab === 'suppliers' ? (
          <SupplierTable
            onDelete={(supplier) => void handleDeleteSupplier(supplier)}
            onEdit={(supplier) => {
              setEditingSupplier(supplier);
              setShowSupplierModal(true);
            }}
            suppliers={filteredSuppliers}
          />
        ) : (
          <OrderTable onMarkReceived={(order) => void markReceived(order)} orders={filteredOrders} suppliers={suppliers} />
        )}
      </section>

      {showSupplierModal ? (
        <Modal onClose={() => setShowSupplierModal(false)} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}>
          <SupplierForm
            supplier={editingSupplier}
            onCancel={() => setShowSupplierModal(false)}
            onSaved={async () => {
              setShowSupplierModal(false);
              await loadAll();
            }}
          />
        </Modal>
      ) : null}

      {showOrderModal ? (
        <Modal onClose={() => setShowOrderModal(false)} title="New Purchase Order">
          <OrderForm
            onCancel={() => setShowOrderModal(false)}
            onSaved={async () => {
              setShowOrderModal(false);
              await loadAll();
            }}
            suppliers={suppliers}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function SupplierTable({
  onDelete,
  onEdit,
  suppliers
}: {
  onDelete: (supplier: Supplier) => void;
  onEdit: (supplier: Supplier) => void;
  suppliers: Supplier[];
}): JSX.Element {
  if (!suppliers.length) return <EmptyState title="No suppliers found" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Contact</th>
            <th>Phone</th>
            <th>Categories</th>
            <th>Location</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((supplier) => (
            <tr key={supplier.id}>
              <td>
                <strong>{supplier.name}</strong>
                {supplier.notes ? <small>{supplier.notes}</small> : null}
              </td>
              <td>{supplier.contact || '-'}</td>
              <td>{supplier.phone || '-'}</td>
              <td>{supplier.categories || '-'}</td>
              <td>{supplier.location || '-'}</td>
              <td>
                <div className="icon-row">
                  <button aria-label={`Edit ${supplier.name}`} onClick={() => onEdit(supplier)} type="button">
                    <Plus aria-hidden="true" size={16} />
                  </button>
                  <button aria-label={`Delete ${supplier.name}`} onClick={() => onDelete(supplier)} type="button">
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderTable({
  onMarkReceived,
  orders,
  suppliers
}: {
  onMarkReceived: (order: PurchaseOrder) => void;
  orders: PurchaseOrder[];
  suppliers: Supplier[];
}): JSX.Element {
  if (!orders.length) return <EmptyState title="No purchase orders found" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>PO</th>
            <th>Supplier</th>
            <th>Order Date</th>
            <th>Expected</th>
            <th>Items</th>
            <th>Total</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const supplier = suppliers.find((entry) => entry.id === order.supplierId);
            return (
              <tr key={order.id}>
                <td className="mono">PO-{order.id}</td>
                <td>{supplier?.name || 'Unknown'}</td>
                <td>{formatDate(order.orderDate)}</td>
                <td>{formatDate(order.expectedDate)}</td>
                <td className="truncate">{purchaseOrderItemsLabel(order)}</td>
                <td>{formatCurrency(order.totalAmount ?? order.cost)}</td>
                <td>
                  <span className={`badge ${order.status}`}>{order.status}</span>
                </td>
                <td>
                  <Button disabled={order.status === 'received'} onClick={() => onMarkReceived(order)} type="button" variant="ghost">
                    <Check aria-hidden="true" size={16} />
                    Receive
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SupplierForm({
  onCancel,
  onSaved,
  supplier
}: {
  onCancel: () => void;
  onSaved: () => Promise<void>;
  supplier: Supplier | null;
}): JSX.Element {
  const [draft, setDraft] = useState({
    id: supplier?.id || '',
    name: supplier?.name || '',
    contact: supplier?.contact || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    location: supplier?.location || '',
    categories: supplier?.categories || '',
    notes: supplier?.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await saveSupplierRecord({ ...supplier, ...draft });
      await onSaved();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <TextInput disabled={Boolean(supplier)} label="Supplier ID" onChange={(event) => setDraft({ ...draft, id: event.target.value })} placeholder="Auto" value={draft.id} />
      <TextInput label="Name" onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} />
      <TextInput label="Contact Person" onChange={(event) => setDraft({ ...draft, contact: event.target.value })} value={draft.contact} />
      <div className="grid two">
        <TextInput label="Phone" onChange={(event) => setDraft({ ...draft, phone: event.target.value })} value={draft.phone} />
        <TextInput label="Email" onChange={(event) => setDraft({ ...draft, email: event.target.value })} type="email" value={draft.email} />
      </div>
      <TextInput label="Location" onChange={(event) => setDraft({ ...draft, location: event.target.value })} value={draft.location} />
      <TextInput label="Categories" onChange={(event) => setDraft({ ...draft, categories: event.target.value })} value={draft.categories} />
      <TextInput label="Notes" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} value={draft.notes} />
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="button-row end">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button loading={saving} type="submit" variant="primary">
          Save Supplier
        </Button>
      </div>
    </form>
  );
}

function OrderForm({
  onCancel,
  onSaved,
  suppliers
}: {
  onCancel: () => void;
  onSaved: () => Promise<void>;
  suppliers: Supplier[];
}): JSX.Element {
  const [draft, setDraft] = useState({
    supplierId: '',
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDate: '',
    items: '',
    totalAmount: '0',
    status: 'pending',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await savePurchaseOrderRecord({
        ...draft,
        totalAmount: Number(draft.totalAmount || 0),
        status: draft.status as PurchaseOrder['status']
      });
      await onSaved();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <SelectInput label="Supplier" onChange={(event) => setDraft({ ...draft, supplierId: event.target.value })} required value={draft.supplierId}>
        <option value="">Select supplier</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </SelectInput>
      <div className="grid two">
        <TextInput label="Order Date" onChange={(event) => setDraft({ ...draft, orderDate: event.target.value })} type="date" value={draft.orderDate} />
        <TextInput label="Expected Date" onChange={(event) => setDraft({ ...draft, expectedDate: event.target.value })} type="date" value={draft.expectedDate} />
      </div>
      <TextInput label="Items" onChange={(event) => setDraft({ ...draft, items: event.target.value })} placeholder="2x Denim Dress, 5x Scarf" required value={draft.items} />
      <div className="grid two">
        <TextInput label="Total Cost" min="0" onChange={(event) => setDraft({ ...draft, totalAmount: event.target.value })} step="0.01" type="number" value={draft.totalAmount} />
        <SelectInput label="Status" onChange={(event) => setDraft({ ...draft, status: event.target.value })} value={draft.status}>
          <option value="pending">Pending</option>
          <option value="ordered">Ordered</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </SelectInput>
      </div>
      <TextInput label="Notes" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} value={draft.notes} />
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="button-row end">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button loading={saving} type="submit" variant="primary">
          Save Order
        </Button>
      </div>
    </form>
  );
}
