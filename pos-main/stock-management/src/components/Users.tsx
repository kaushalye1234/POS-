import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { AuthUser, Role } from '../types';
import { createSystemUserAccount, getSystemUsers, updateSystemUserAccount } from '../api';
import { formatDate, getErrorMessage } from '../utils';
import { Button, EmptyState, Modal, SelectInput, TextInput } from './Ui';

interface UsersProps {
  currentUser: AuthUser;
}

export function Users({ currentUser }: UsersProps): JSX.Element {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [query, setQuery] = useState('');
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadUsers(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      setUsers(await getSystemUsers());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentUser.role === 'admin') void loadUsers();
  }, [currentUser.role]);

  const filteredUsers = useMemo(() => {
    const term = query.toLowerCase().trim();
    return users.filter((user) => [user.username, user.role, user.employeeId || ''].join(' ').toLowerCase().includes(term));
  }, [query, users]);

  if (currentUser.role !== 'admin') {
    return (
      <section className="view-stack">
        <div className="notice warn">
          <ShieldCheck aria-hidden="true" size={18} />
          <span>Administrator role required.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="view-stack">
      <div className="action-band">
        <div>
          <p className="eyebrow">Access control</p>
          <h2>{filteredUsers.length.toLocaleString()} user accounts</h2>
        </div>
        <div className="button-row">
          <Button loading={loading} onClick={loadUsers} type="button">
            <RefreshCw aria-hidden="true" size={16} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setEditingUser(null);
              setShowModal(true);
            }}
            type="button"
            variant="primary"
          >
            <Plus aria-hidden="true" size={16} />
            User
          </Button>
        </div>
      </div>

      {error ? <div className="notice danger">{error}</div> : null}

      <section className="panel">
        <div className="toolbar">
          <div className="search-box">
            <Search aria-hidden="true" size={18} />
            <input aria-label="Search users" onChange={(event) => setQuery(event.target.value)} placeholder="Search username, role, employee" value={query} />
          </div>
        </div>
        {filteredUsers.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user._id || user.id || user.username}>
                    <td>
                      <strong>{user.username}</strong>
                    </td>
                    <td>
                      <span className={`badge role-${user.role}`}>{user.role}</span>
                    </td>
                    <td>{user.employeeId || '-'}</td>
                    <td>
                      <span className={`badge ${user.isActive === false ? 'danger' : 'good'}`}>{user.isActive === false ? 'Inactive' : 'Active'}</span>
                    </td>
                    <td>{formatDate(user.lastLogin)}</td>
                    <td>
                      <button
                        aria-label={`Edit ${user.username}`}
                        onClick={() => {
                          setEditingUser(user);
                          setShowModal(true);
                        }}
                        type="button"
                      >
                        <Pencil aria-hidden="true" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No user accounts found" />
        )}
      </section>

      {showModal ? (
        <Modal onClose={() => setShowModal(false)} title={editingUser ? 'Edit User' : 'Create User'}>
          <UserForm
            onCancel={() => setShowModal(false)}
            onSaved={async () => {
              setShowModal(false);
              await loadUsers();
            }}
            user={editingUser}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function UserForm({
  onCancel,
  onSaved,
  user
}: {
  onCancel: () => void;
  onSaved: () => Promise<void>;
  user: AuthUser | null;
}): JSX.Element {
  const [draft, setDraft] = useState({
    username: user?.username || '',
    password: '',
    role: user?.role || 'cashier',
    employeeId: user?.employeeId || '',
    pin: '',
    isActive: user?.isActive !== false
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (user) {
        const userId = user._id || user.id;
        if (!userId) throw new Error('User ID is missing.');
        await updateSystemUserAccount(userId, {
          role: draft.role as Role,
          employeeId: draft.employeeId || null,
          isActive: draft.isActive,
          ...(draft.password ? { password: draft.password } : {}),
          ...(draft.pin ? { pin: draft.pin } : {})
        });
      } else {
        await createSystemUserAccount({
          username: draft.username.trim(),
          password: draft.password,
          role: draft.role as Role,
          employeeId: draft.employeeId || null,
          pin: draft.pin || null
        });
      }
      await onSaved();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <TextInput disabled={Boolean(user)} label="Username" onChange={(event) => setDraft({ ...draft, username: event.target.value })} required value={draft.username} />
      <TextInput
        label="Password"
        minLength={user ? undefined : 6}
        onChange={(event) => setDraft({ ...draft, password: event.target.value })}
        required={!user}
        type="password"
        value={draft.password}
      />
      <SelectInput label="Role" onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })} value={draft.role}>
        <option value="cashier">Cashier</option>
        <option value="manager">Manager</option>
        <option value="admin">Admin</option>
      </SelectInput>
      <TextInput label="Employee ID" onChange={(event) => setDraft({ ...draft, employeeId: event.target.value })} value={draft.employeeId} />
      <TextInput label="Override PIN" minLength={4} onChange={(event) => setDraft({ ...draft, pin: event.target.value })} type="password" value={draft.pin} />
      <label className="check-row">
        <input checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} type="checkbox" />
        Active
      </label>
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="button-row end">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button loading={saving} type="submit" variant="primary">
          Save User
        </Button>
      </div>
    </form>
  );
}
