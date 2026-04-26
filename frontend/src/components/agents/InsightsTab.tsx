import { useState, useCallback, useId, useEffect, useMemo } from 'react';
import type { NoteWithOrg } from '../../types';
import { useUnconfirmedInsightsAcrossOrgs, useConfirmInsight, useRejectInsight } from '../../api/useNotes';

// ---------------------------------------------------------------------------
// Single insight row
// ---------------------------------------------------------------------------

interface InsightRowProps {
  note: NoteWithOrg;
  selected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onAccept: (note: NoteWithOrg) => void;
  onDismiss: (note: NoteWithOrg) => void;
  accepting: boolean;
  dismissing: boolean;
  checkboxGroupId: string;
}

function formatProvenance(note: NoteWithOrg): string {
  const prov = note.provenance;
  const src = prov?.source_org_id
    ? `org #${prov.source_org_id}'s agent thread`
    : `${note.org_name}'s agent thread`;

  const ts = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(note.created_at));

  return `from ${src}, ${ts}`;
}

function InsightRow({
  note,
  selected,
  onSelect,
  onAccept,
  onDismiss,
  accepting,
  dismissing,
  checkboxGroupId,
}: InsightRowProps) {
  const checkId = `insight-check-${note.id}`;
  const isBusy = accepting || dismissing;

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 8px 1fr auto',
        alignItems: 'start',
        gap: 12,
        padding: '14px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      {/* Checkbox */}
      <div style={{ paddingTop: 2 }}>
        <input
          type="checkbox"
          id={checkId}
          name={checkboxGroupId}
          checked={selected}
          onChange={(e) => onSelect(note.id, e.target.checked)}
          aria-label={`Select insight from ${note.org_name}`}
          style={{
            width: 15,
            height: 15,
            accentColor: 'var(--accent)',
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Vermilion dot — transient signal per design budget */}
      <div style={{ paddingTop: 6 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Content */}
      <div style={{ minWidth: 0 }}>
        {/* Org name */}
        <p
          style={{
            margin: '0 0 4px',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink-1)',
            fontFamily: 'var(--body)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {note.org_name}
        </p>

        {/* Note content — line-clamp-2 */}
        <p
          style={{
            margin: '0 0 6px',
            fontSize: 14,
            color: 'var(--ink-1)',
            fontFamily: 'var(--body)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {note.content}
        </p>

        {/* Provenance */}
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
          }}
        >
          {formatProvenance(note)}
        </p>
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexShrink: 0,
          paddingTop: 2,
        }}
      >
        <button
          type="button"
          onClick={() => onAccept(note)}
          disabled={isBusy}
          aria-label={`Accept insight from ${note.org_name}`}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'var(--body)',
            color: 'var(--ink-1)',
            background: 'var(--bg-2)',
            border: '1px solid var(--rule)',
            borderRadius: 5,
            cursor: isBusy ? 'not-allowed' : 'pointer',
            opacity: isBusy ? 0.5 : 1,
            transition: 'opacity 200ms var(--ease)',
            whiteSpace: 'nowrap',
          }}
        >
          {accepting ? 'Accepting…' : 'Accept Insight'}
        </button>
        <button
          type="button"
          onClick={() => onDismiss(note)}
          disabled={isBusy}
          aria-label={`Dismiss insight from ${note.org_name}`}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'var(--body)',
            color: 'var(--ink-2)',
            background: 'none',
            border: '1px solid var(--rule)',
            borderRadius: 5,
            cursor: isBusy ? 'not-allowed' : 'pointer',
            opacity: isBusy ? 0.5 : 1,
            transition: 'opacity 200ms var(--ease)',
            whiteSpace: 'nowrap',
          }}
        >
          {dismissing ? 'Dismissing…' : 'Dismiss Insight'}
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Bulk sticky bar
// ---------------------------------------------------------------------------

interface BulkBarProps {
  count: number;
  onBulkAccept: () => void;
  onBulkDismiss: () => void;
  isBusy: boolean;
}

function BulkBar({ count, onBulkAccept, onBulkDismiss, isBusy }: BulkBarProps) {
  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--bg)',
        border: '1px solid var(--rule)',
        borderRadius: 8,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: 'none',
        zIndex: 100,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontFamily: 'var(--body)',
          color: 'var(--ink-2)',
          whiteSpace: 'nowrap',
        }}
      >
        <strong style={{ color: 'var(--ink-1)' }} className="tnum">
          {count}
        </strong>
        {' '}selected
      </span>
      <button
        type="button"
        onClick={onBulkAccept}
        disabled={isBusy}
        style={{
          padding: '7px 16px',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'var(--body)',
          color: 'var(--ink-1)',
          background: 'var(--bg-2)',
          border: '1px solid var(--rule)',
          borderRadius: 5,
          cursor: isBusy ? 'not-allowed' : 'pointer',
          opacity: isBusy ? 0.5 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        Accept selected ({count})
      </button>
      <button
        type="button"
        onClick={onBulkDismiss}
        disabled={isBusy}
        style={{
          padding: '7px 16px',
          fontSize: 13,
          fontWeight: 500,
          fontFamily: 'var(--body)',
          color: 'var(--ink-2)',
          background: 'none',
          border: '1px solid var(--rule)',
          borderRadius: 5,
          cursor: isBusy ? 'not-allowed' : 'pointer',
          opacity: isBusy ? 0.5 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        Dismiss selected ({count})
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab panel
// ---------------------------------------------------------------------------

export function InsightsTab({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const { data: insights, isLoading } = useUnconfirmedInsightsAcrossOrgs(50);
  const confirmMutation = useConfirmInsight();
  const rejectMutation = useRejectInsight();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const checkboxGroupId = useId();

  const allInsights = useMemo(() => insights ?? [], [insights]);

  // Notify parent of count — run in effect to avoid setState-in-render
  const currentCount = allInsights.length;
  useEffect(() => {
    onCountChange?.(currentCount);
  }, [currentCount, onCountChange]);

  const handleSelect = useCallback((id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleAccept = useCallback(
    async (note: NoteWithOrg) => {
      setBusyIds((prev) => { const s = new Set(prev); s.add(note.id); return s; });
      try {
        await confirmMutation.mutateAsync({ id: note.id, orgId: note.organization_id });
        setSelectedIds((prev) => {
          const s = new Set(prev);
          s.delete(note.id);
          return s;
        });
      } finally {
        setBusyIds((prev) => { const s = new Set(prev); s.delete(note.id); return s; });
      }
    },
    [confirmMutation],
  );

  const handleDismiss = useCallback(
    async (note: NoteWithOrg) => {
      setBusyIds((prev) => { const s = new Set(prev); s.add(note.id); return s; });
      try {
        await rejectMutation.mutateAsync({ id: note.id, orgId: note.organization_id });
        setSelectedIds((prev) => {
          const s = new Set(prev);
          s.delete(note.id);
          return s;
        });
      } finally {
        setBusyIds((prev) => { const s = new Set(prev); s.delete(note.id); return s; });
      }
    },
    [rejectMutation],
  );

  const handleBulkAccept = useCallback(async () => {
    const ids = [...selectedIds];
    const targets = allInsights.filter((n) => ids.includes(n.id));
    for (const note of targets) {
      await handleAccept(note);
    }
  }, [selectedIds, allInsights, handleAccept]);

  const handleBulkDismiss = useCallback(async () => {
    const ids = [...selectedIds];
    const targets = allInsights.filter((n) => ids.includes(n.id));
    for (const note of targets) {
      await handleDismiss(note);
    }
  }, [selectedIds, allInsights, handleDismiss]);

  const isBulkBusy = busyIds.size > 0;

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading insights"
        style={{
          padding: '48px 0',
          color: 'var(--ink-3)',
          fontFamily: 'var(--body)',
          fontSize: 14,
        }}
      >
        Loading insights…
      </div>
    );
  }

  return (
    <div>
      {/* Heading */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--body)',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--ink-1)',
            margin: 0,
          }}
        >
          Unconfirmed insights
        </h2>
        <span
          aria-label={`${allInsights.length} unconfirmed insights`}
          className="tnum"
          style={{ fontSize: 14, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}
        >
          {allInsights.length}
        </span>
      </div>

      {/* Empty state */}
      {allInsights.length === 0 && (
        <div
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 8,
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            fontSize: 14,
          }}
        >
          No agent insights waiting for review.
        </div>
      )}

      {/* Insight list */}
      {allInsights.length > 0 && (
        <ul
          role="list"
          aria-label="Unconfirmed agent insights"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {allInsights.map((note) => (
            <InsightRow
              key={note.id}
              note={note}
              selected={selectedIds.has(note.id)}
              onSelect={handleSelect}
              onAccept={(n) => void handleAccept(n)}
              onDismiss={(n) => void handleDismiss(n)}
              accepting={busyIds.has(note.id) && confirmMutation.isPending}
              dismissing={busyIds.has(note.id) && rejectMutation.isPending}
              checkboxGroupId={checkboxGroupId}
            />
          ))}
        </ul>
      )}

      {/* Sticky bulk bar */}
      <BulkBar
        count={selectedIds.size}
        onBulkAccept={() => void handleBulkAccept()}
        onBulkDismiss={() => void handleBulkDismiss()}
        isBusy={isBulkBusy}
      />

      {/* Bottom padding so sticky bar doesn't overlap last row */}
      {selectedIds.size > 0 && (
        <div style={{ height: 80 }} aria-hidden="true" />
      )}
    </div>
  );
}
