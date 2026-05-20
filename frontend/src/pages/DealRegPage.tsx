import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import {
  useCreateDealReg,
  useDealRegs,
  useDeleteDealReg,
  useUpdateDealReg,
} from '../api';
import type { DealReg } from '../types';

type DealRegDraft = Pick<DealReg, 'vendor' | 'customer' | 'deal_reg_number' | 'project' | 'notes'>;

const columns = [
  { key: 'vendor', label: 'Vendor', width: '15%' },
  { key: 'customer', label: 'Customer', width: '17%' },
  { key: 'deal_reg_number', label: 'Deal reg #', width: '15%' },
  { key: 'project', label: 'Project', width: '20%' },
  { key: 'notes', label: 'Notes', width: '28%' },
] as const;

const panelStyle: CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 8,
  background: 'var(--surface)',
  overflow: 'hidden',
};

const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--rule)',
  borderRadius: 5,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 13,
  padding: '8px 10px',
  boxSizing: 'border-box',
};

function blankDraft(): DealRegDraft {
  return {
    vendor: '',
    customer: '',
    deal_reg_number: '',
    project: '',
    notes: '',
  };
}

function toDraft(row: DealReg): DealRegDraft {
  return {
    vendor: row.vendor,
    customer: row.customer,
    deal_reg_number: row.deal_reg_number,
    project: row.project,
    notes: row.notes,
  };
}

function matchesFilter(row: DealRegDraft, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return Object.values(row).some((value) => value.toLowerCase().includes(needle));
}

function keyBlursOnEnter(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

export function DealRegPage() {
  const dealRegsQuery = useDealRegs();
  const createDealReg = useCreateDealReg();
  const updateDealReg = useUpdateDealReg();
  const deleteDealReg = useDeleteDealReg();
  const [filter, setFilter] = useState('');
  const [drafts, setDrafts] = useState<Record<number, DealRegDraft>>({});

  useEffect(() => {
    const next: Record<number, DealRegDraft> = {};
    for (const row of dealRegsQuery.data ?? []) {
      next[row.id] = drafts[row.id] ?? toDraft(row);
    }
    setDrafts(next);
    // Preserve in-progress cell edits while still seeding newly fetched rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealRegsQuery.data]);

  const rows = useMemo(
    () => (dealRegsQuery.data ?? []).filter((row) => matchesFilter(drafts[row.id] ?? toDraft(row), filter)),
    [dealRegsQuery.data, drafts, filter],
  );

  const updateDraft = (id: number, field: keyof DealRegDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? blankDraft()),
        [field]: value,
      },
    }));
  };

  const saveRow = (row: DealReg) => {
    const draft = drafts[row.id] ?? toDraft(row);
    const original = toDraft(row);
    const changed = columns.some(({ key }) => draft[key] !== original[key]);
    if (!changed) return;
    updateDealReg.mutate({ id: row.id, ...draft });
  };

  const addRow = async () => {
    const created = await createDealReg.mutateAsync({
      vendor: '',
      customer: '',
      deal_reg_number: '',
      project: '',
      notes: '',
    });
    setDrafts((current) => ({ ...current, [created.id]: blankDraft() }));
  };

  const inputFor = (row: DealReg, key: keyof DealRegDraft) => {
    const draft = drafts[row.id] ?? toDraft(row);
    const common = {
      value: draft[key],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        updateDraft(row.id, key, event.target.value),
      onBlur: () => saveRow(row),
      onKeyDown: keyBlursOnEnter,
      style: inputStyle,
    };
    if (key === 'notes') {
      return <textarea aria-label={`${row.id} notes`} rows={2} {...common} />;
    }
    return <input aria-label={`${row.id} ${key}`} {...common} />;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Tracking"
        title="Deal Reg"
        subtitle="Keep vendor registration numbers tied to customers and projects."
      />

      <section style={panelStyle}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--rule)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ position: 'relative', flex: '1 1 320px', maxWidth: 520 }}>
            <span className="sr-only">Filter deal registrations</span>
            <Search size={15} strokeWidth={1.5} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-3)' }} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter vendor, customer, deal reg #, project, notes"
              style={{ ...inputStyle, paddingLeft: 32 }}
            />
          </label>
          <button
            type="button"
            onClick={() => void addRow()}
            disabled={createDealReg.isPending}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              border: '1px solid var(--rule)',
              borderRadius: 5,
              background: 'var(--bg)',
              color: createDealReg.isPending ? 'var(--ink-3)' : 'var(--ink-2)',
              cursor: createDealReg.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--body)',
              fontSize: 13,
              padding: '8px 12px',
            }}
          >
            <Plus size={15} strokeWidth={1.5} />
            Add deal reg
          </button>
        </div>

        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {columns.map((column) => (
                  <th key={column.key} style={{ width: column.width, padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--rule)' }}>
                    {column.label}
                  </th>
                ))}
                <th style={{ width: 66, padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid var(--rule)' }}> </th>
              </tr>
            </thead>
            <tbody>
              {dealRegsQuery.isLoading ? (
                <tr><td colSpan={6} style={{ padding: 18, color: 'var(--ink-3)' }}>Loading deal registrations...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 18, color: 'var(--ink-3)' }}>No deal registrations found.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  {columns.map(({ key }) => (
                    <td key={key} style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', verticalAlign: 'top' }}>
                      {inputFor(row, key)}
                    </td>
                  ))}
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'right', verticalAlign: 'top' }}>
                    <button
                      type="button"
                      aria-label={`Delete deal registration ${row.deal_reg_number || row.vendor || row.id}`}
                      onClick={() => deleteDealReg.mutate(row.id)}
                      disabled={deleteDealReg.isPending}
                      style={{
                        border: '1px solid var(--rule)',
                        borderRadius: 5,
                        background: 'var(--bg)',
                        color: 'var(--accent)',
                        cursor: deleteDealReg.isPending ? 'not-allowed' : 'pointer',
                        padding: 8,
                      }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
