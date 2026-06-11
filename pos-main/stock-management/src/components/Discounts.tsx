import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { DiscountRule } from '../types';
import { deleteDiscountRuleRecord, getDiscountRules, saveDiscountRuleRecord } from '../api';
import { discountValueLabel, getErrorMessage, isDiscountLive, normalizeDiscountRule } from '../utils';
import { Button, EmptyState, Modal, SelectInput, TextInput } from './Ui';

export function Discounts(): JSX.Element {
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadRules(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      setRules(await getDiscountRules());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRules();
  }, []);

  const filteredRules = useMemo(() => {
    const term = query.toLowerCase().trim();
    return rules.filter((rule) => {
      if (statusFilter === 'live' && !isDiscountLive(rule)) return false;
      if (statusFilter === 'paused' && rule.active) return false;
      if (statusFilter === 'threshold' && !rule.minPurchase) return false;
      return [rule.name, rule.description, rule.appliesTo, rule.type].join(' ').toLowerCase().includes(term);
    });
  }, [query, rules, statusFilter]);

  async function handleDelete(rule: DiscountRule): Promise<void> {
    if (!window.confirm(`Delete discount rule ${rule.name}?`)) return;
    setError('');
    try {
      await deleteDiscountRuleRecord(rule.id);
      await loadRules();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    }
  }

  async function toggleActive(rule: DiscountRule): Promise<void> {
    await saveDiscountRuleRecord({ ...rule, active: !rule.active });
    await loadRules();
  }

  return (
    <section className="view-stack">
      <div className="action-band">
        <div>
          <p className="eyebrow">Promotions</p>
          <h2>{filteredRules.length.toLocaleString()} discount rules</h2>
        </div>
        <div className="button-row">
          <Button loading={loading} onClick={loadRules} type="button">
            <RefreshCw aria-hidden="true" size={16} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setEditingRule(null);
              setShowModal(true);
            }}
            type="button"
            variant="primary"
          >
            <Plus aria-hidden="true" size={16} />
            Rule
          </Button>
        </div>
      </div>

      {error ? <div className="notice danger">{error}</div> : null}

      <section className="panel">
        <div className="toolbar">
          <div className="search-box">
            <Search aria-hidden="true" size={18} />
            <input aria-label="Search discount rules" onChange={(event) => setQuery(event.target.value)} placeholder="Search rules" value={query} />
          </div>
          <SelectInput label="Status" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">All rules</option>
            <option value="live">Live</option>
            <option value="paused">Paused</option>
            <option value="threshold">Threshold</option>
          </SelectInput>
        </div>

        {filteredRules.length ? (
          <div className="rule-grid">
            {filteredRules.map((rule) => (
              <article className={`rule-card ${isDiscountLive(rule) ? 'live' : 'paused'}`} key={rule.id}>
                <div className="rule-card-head">
                  <span className={`badge ${isDiscountLive(rule) ? 'good' : 'neutral'}`}>{isDiscountLive(rule) ? 'Live' : rule.active ? 'Scheduled' : 'Paused'}</span>
                  <strong>{discountValueLabel(rule)}</strong>
                </div>
                <h3>{rule.name}</h3>
                <p>{rule.description || 'No description'}</p>
                <div className="chip-row">
                  <span>{rule.type}</span>
                  <span>{rule.appliesTo || 'all'}</span>
                  {rule.minPurchase ? <span>Min Rs. {rule.minPurchase.toLocaleString('en-LK')}</span> : null}
                </div>
                <div className="button-row">
                  <Button onClick={() => void toggleActive(rule)} type="button" variant="ghost">
                    {rule.active ? 'Pause' : 'Activate'}
                  </Button>
                  <button
                    aria-label={`Edit ${rule.name}`}
                    onClick={() => {
                      setEditingRule(rule);
                      setShowModal(true);
                    }}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={16} />
                  </button>
                  <button aria-label={`Delete ${rule.name}`} onClick={() => void handleDelete(rule)} type="button">
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No discount rules found" />
        )}
      </section>

      {showModal ? (
        <Modal onClose={() => setShowModal(false)} title={editingRule ? 'Edit Discount Rule' : 'New Discount Rule'}>
          <DiscountForm
            onCancel={() => setShowModal(false)}
            onSaved={async () => {
              setShowModal(false);
              await loadRules();
            }}
            rule={editingRule}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function DiscountForm({
  onCancel,
  onSaved,
  rule
}: {
  onCancel: () => void;
  onSaved: () => Promise<void>;
  rule: DiscountRule | null;
}): JSX.Element {
  const normalized = normalizeDiscountRule(rule || {});
  const [draft, setDraft] = useState({
    id: rule?.id || '',
    name: rule?.name || '',
    type: normalized.type,
    valueType: normalized.valueType,
    value: String(normalized.value),
    valueMin: String(normalized.valueMin),
    valueMax: String(normalized.valueMax),
    appliesTo: normalized.appliesTo,
    minPurchase: String(normalized.minPurchase),
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    description: normalized.description,
    active: normalized.active
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await saveDiscountRuleRecord({
        id: draft.id,
        name: draft.name.trim(),
        type: draft.type,
        valueType: draft.type === 'bogo' ? 'fixed' : draft.valueType,
        value: draft.type === 'bogo' ? 0 : Number(draft.value || 0),
        valueMin: Number(draft.valueMin || 0),
        valueMax: Number(draft.valueMax || 0),
        appliesTo: draft.appliesTo || 'all',
        minPurchase: Number(draft.minPurchase || 0),
        startDate: draft.startDate,
        endDate: draft.endDate,
        description: draft.description,
        active: draft.active,
        _id: rule?._id
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
      <TextInput disabled={Boolean(rule)} label="Rule ID" onChange={(event) => setDraft({ ...draft, id: event.target.value })} placeholder="Auto" value={draft.id} />
      <TextInput label="Name" onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} />
      <div className="grid two">
        <SelectInput label="Type" onChange={(event) => setDraft({ ...draft, type: event.target.value as DiscountRule['type'] })} value={draft.type}>
          <option value="percentage">Percentage</option>
          <option value="fixed">Fixed</option>
          <option value="bogo">BOGO</option>
        </SelectInput>
        <SelectInput label="Value Mode" onChange={(event) => setDraft({ ...draft, valueType: event.target.value as DiscountRule['valueType'] })} value={draft.valueType}>
          <option value="fixed">Fixed</option>
          <option value="range">Range</option>
        </SelectInput>
      </div>
      {draft.valueType === 'range' && draft.type !== 'bogo' ? (
        <div className="grid two">
          <TextInput label="Minimum Value" min="0" onChange={(event) => setDraft({ ...draft, valueMin: event.target.value })} type="number" value={draft.valueMin} />
          <TextInput label="Maximum Value" min="0" onChange={(event) => setDraft({ ...draft, valueMax: event.target.value })} type="number" value={draft.valueMax} />
        </div>
      ) : (
        <TextInput disabled={draft.type === 'bogo'} label="Value" min="0" onChange={(event) => setDraft({ ...draft, value: event.target.value })} type="number" value={draft.value} />
      )}
      <TextInput label="Applies To" onChange={(event) => setDraft({ ...draft, appliesTo: event.target.value })} value={draft.appliesTo} />
      <TextInput label="Minimum Purchase" min="0" onChange={(event) => setDraft({ ...draft, minPurchase: event.target.value })} type="number" value={draft.minPurchase} />
      <div className="grid two">
        <TextInput label="Start Date" onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} type="date" value={draft.startDate} />
        <TextInput label="End Date" onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} type="date" value={draft.endDate} />
      </div>
      <TextInput label="Description" onChange={(event) => setDraft({ ...draft, description: event.target.value })} value={draft.description} />
      <label className="check-row">
        <input checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} type="checkbox" />
        Active
      </label>
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="button-row end">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button loading={saving} type="submit" variant="primary">
          Save Rule
        </Button>
      </div>
    </form>
  );
}
