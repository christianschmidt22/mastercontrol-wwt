import { useState, useCallback, useId, useEffect, useMemo, useRef } from 'react';
import type { Note } from '../../types';
import { useNotes, useConfirmInsight, useRejectInsight } from '../../api/useNotes';
import { useOrganizations } from '../../api/useOrganizations';
import type { Organization } from '../../types';

// ---------------------------------------------------------------------------
// Per-org insights fetcher
// ---------------------------------------------------------------------------

/**
 * OrgInsights renders nothing visible — it fetches unconfirmed insights for one
 * org and calls onInsights when the data lands or changes.
 *
 * NOTE: A backend aggregator endpoint (`GET /api/notes/unconfirmed`) would be
 * more efficient once org count grows past ~20. For now we fan-out per org
 * from the client — see architecture discussion in InsightsTab body.
 */
function OrgInsightsFetcher({
  org,
  onInsights,
}: {
  org: Organization;
  onInsights: (orgId: number, notes: Note[]) => void;
}) {
  const { data } = useNotes(org.id, { includeUnconfirmed: true });

  // Filter to unconfirmed agent_insight notes
  const insights =
    data?.filter((n) => n.role === 'agent_insight' && !n.confirmed) ?? [];

  // Use a ref to hold the callback so the effect doesn't need it as a dep
  const onInsightsRef = useRef(onInsights);
  useEffect(() => {
    onInsightsRef.current = onInsights;
  });

  // Report upstream whenever the insights array identity changes
  const insightsRef = useRef<Note[]>([]);
  useEffect(() => {
    // Only notify when IDs actually change
    const prev = insightsRef.current;
    const changed =
      prev.length !== insights.length ||
      prev.some((n, i) => n.id !== insights[i]?.id);
    if (changed) {
      insightsRef.current = insights;
      onInsightsRef.current(org.id, insights);
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// Single insight row
// ---------------------------------------------------------------------------

interface InsightRowProps {
  note: Note;
  orgName: string;
  selected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onAccept: (note: Note) => void;
  onDismiss: (note: Note) => void;
  accepting: boolean;
  dismissing: boolean;
  checkboxGroupId: string;
}

function formatProvenance(note: Note, orgName: string): string {
  const prov = note.provenance;
  const src = prov?.source_org_id
    ? `org #${prov.source_org_id}’s agent thread`
    : `${orgName}’s agent thread`;

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
  orgName,
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
          aria-label={`Select insight from ${orgName}`}
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
          {orgName}
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
          {formatProvenance(note, orgName)}
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
          aria-label={`Accept insight from ${orgName}`}
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
          aria-label={`Dismiss insight from ${orgName}`}
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
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
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
        {' '}selected
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
// Aggregated state
// ---------------------------------------------------------------------------

interface InsightWithOrg {
  note: Note;
  orgId: number;
  orgName: string;
}

// ---------------------------------------------------------------------------
// Tab panel
// ---------------------------------------------------------------------------

export function InsightsTab({ onCountChange }: { onCountChange?: (n: number) => void }) {
  /*
   * Architecture note: We fan-out one `useNotes` query per org to collect
   * unconfirmed insights. This is acceptable at the current org count (~5–20).
   * If org count grows past ~20, a dedicated backend endpoint
   * `GET /api/notes/unconfirmed` that aggregates server-side should replace
   * this pattern. The OrgInsightsFetcher components mount as data-only
   * renderless nodes — they produce no DOM.
   */
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const confirmMutation = useConfirmInsight();
  const rejectMutation = useRejectInsight();

  // Map<orgId, Note[]> — updated by OrgInsightsFetcher children via callback
  const [orgInsightsMap, setOrgInsightsMap] = useState<Map<number, Note[]>>(
    new Map(),
  );

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const checkboxGroupId = useId();

  const handleOrgInsights = useCallback(
    (orgId: number, notes: Note[]) => {
      setOrgInsightsMap((prev) => {
        const next = new Map(prev);
        next.set(orgId, notes);
        return next;
      });
    },
    [],
  );

  // Flatten + sort newest first
  const orgMap = new Map<number, string>(
    (orgs ?? []).map((o) => [o.id, o.name]),
  );

  const allInsights: InsightWithOrg[] = [];
  for (const [orgId, notes] of orgInsightsMap) {
    const orgName = orgMap.get(orgId) ?? `Org #${orgId}`;
    for (const note of notes) {
      allInsights.push({ note, orgId, orgName });
    }
  }
  allInsights.sort(
    (a, b) =>
      new Date(b.note.created_at).getTime() -
      new Date(a.note.created_at).getTime(),
  );

  // Notify parent of count — run in effect to avoid setState-in-render
  const currentCount = allInsights.length;
  useEffect(() => {
    onCountChange?.(currentCount);
  }, [currentCount, onCountChange]);

  // Handlers
  const handleSelect = useCallback((id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleAccept = useCallback(
    async (note: Note) => {
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
    async (note: Note) => {
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
    const targets = allInsights.filter((i) => ids.includes(i.note.id));
    for (const { note } of targets) {
      await handleAccept(note);
    }
  }, [selectedIds, allInsights, handleAccept]);

  const handleBulkDismiss = useCallback(async () => {
    const ids = [...selectedIds];
    const targets = allInsights.filter((i) => ids.includes(i.note.id));
    for (const { note } of targets) {
      await handleDismiss(note);
    }
  }, [selectedIds, allInsights, handleDismiss]);

  const isBulkBusy = busyIds.size > 0;

  if (orgsLoading) {
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
      {/* Mount a renderless fetcher per org — aggregates via callback */}
      {(orgs ?? []).map((org) => (
        <OrgInsightsFetcher key={org.id} org={org} onInsights={handleOrgInsights} />
      ))}

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
          {allInsights.map(({ note, orgName }) => (
            <InsightRow
              key={note.id}
              note={note}
              orgName={orgName}
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
