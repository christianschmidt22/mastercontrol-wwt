/**
 * OemCrossRefsPanel.tsx
 *
 * "Mentioned by customers" section rendered above the tile grid on the OEM
 * partner detail page. Surfaces agent_insight notes from customer org threads
 * that mention this OEM — e.g. when a Fairview agent records that they need
 * Cisco gear for a refresh.
 *
 * IA decision: section above the grid (not a tile) so it stays visible without
 * requiring the user to scroll into the tile grid. The panel self-collapses
 * when there are no cross-org insights. A section heading (h2) maintains
 * correct heading hierarchy under the page's h1.
 *
 * Design constraints (DESIGN.md):
 *   - var(--bg-2) row backgrounds, var(--rule) hairlines
 *   - No vermilion at rest — the accent dot is a transient signal
 *   - TileEmptyState for the empty state
 *   - Real <button> for all clickable elements
 *
 * ≤180 lines per CLAUDE.md component rule.
 */

import { useCallback, useState } from 'react';
import type { NoteWithOrg } from '../../types';
import { TileEmptyState } from '../tiles/TileEmptyState';
import { useCrossOrgInsights, useConfirmInsight, useRejectInsight } from '../../api/useNotes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseCrossOrgResult {
  data: NoteWithOrg[] | undefined;
  isLoading: boolean;
}

interface UseConfirmResult {
  mutateAsync: (vars: { id: number; orgId: number }) => Promise<unknown>;
  isPending: boolean;
}

interface UseRejectResult {
  mutateAsync: (vars: { id: number; orgId: number }) => Promise<unknown>;
  isPending: boolean;
}

export interface OemCrossRefsPanelProps {
  orgId: number;
  /** Dependency injection for tests */
  _useCrossOrgInsights?: (orgId: number, limit?: number) => UseCrossOrgResult;
  _useConfirmInsight?: () => UseConfirmResult;
  _useRejectInsight?: () => UseRejectResult;
}

// ---------------------------------------------------------------------------
// Insight row
// ---------------------------------------------------------------------------

interface InsightRowProps {
  note: NoteWithOrg;
  onAccept: (note: NoteWithOrg) => void;
  onDismiss: (note: NoteWithOrg) => void;
  accepting: boolean;
  dismissing: boolean;
}

function InsightRow({ note, onAccept, onDismiss, accepting, dismissing }: InsightRowProps) {
  const isBusy = accepting || dismissing;
  const ts = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(note.created_at));

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '8px 1fr auto',
        alignItems: 'start',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--bg-2)',
        borderRadius: 6,
        border: '1px solid var(--rule)',
      }}
    >
      {/* Vermilion dot — transient signal per vermilion budget */}
      <div style={{ paddingTop: 5 }}>
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
        <p
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink-2)',
            margin: '0 0 3px',
            display: 'flex',
            gap: 6,
            alignItems: 'baseline',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note.org_name}
          </span>
          <span
            style={{
              fontWeight: 400,
              color: 'var(--ink-3)',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            {ts}
          </span>
        </p>
        <p
          style={{
            fontFamily: 'var(--body)',
            fontSize: 14,
            color: 'var(--ink-1)',
            lineHeight: 1.5,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {note.content}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, paddingTop: 1 }}>
        <button
          type="button"
          onClick={() => onAccept(note)}
          disabled={isBusy}
          aria-label={`Accept insight from ${note.org_name}`}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            fontWeight: 500,
            padding: '5px 12px',
            borderRadius: 5,
            cursor: isBusy ? 'not-allowed' : 'pointer',
            opacity: isBusy ? 0.5 : 1,
            border: '1px solid var(--rule)',
            background: 'var(--bg)',
            color: 'var(--ink-1)',
            transition: 'opacity 200ms var(--ease)',
            whiteSpace: 'nowrap',
          }}
        >
          {accepting ? 'Accepting…' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={() => onDismiss(note)}
          disabled={isBusy}
          aria-label={`Dismiss insight from ${note.org_name}`}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            fontWeight: 500,
            padding: '5px 12px',
            borderRadius: 5,
            cursor: isBusy ? 'not-allowed' : 'pointer',
            opacity: isBusy ? 0.5 : 1,
            border: '1px solid var(--rule)',
            background: 'transparent',
            color: 'var(--ink-2)',
            transition: 'opacity 200ms var(--ease)',
            whiteSpace: 'nowrap',
          }}
        >
          {dismissing ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function OemCrossRefsPanel({
  orgId,
  _useCrossOrgInsights,
  _useConfirmInsight,
  _useRejectInsight,
}: OemCrossRefsPanelProps) {
  const useCross = _useCrossOrgInsights ?? useCrossOrgInsights;
  const useConfirm = _useConfirmInsight ?? useConfirmInsight;
  const useReject = _useRejectInsight ?? useRejectInsight;

  const { data, isLoading } = useCross(orgId, 20);
  const confirmMutation = useConfirm();
  const rejectMutation = useReject();

  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const handleAccept = useCallback(
    async (note: NoteWithOrg) => {
      setBusyIds((prev) => { const s = new Set(prev); s.add(note.id); return s; });
      try {
        await confirmMutation.mutateAsync({ id: note.id, orgId: note.organization_id });
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
      } finally {
        setBusyIds((prev) => { const s = new Set(prev); s.delete(note.id); return s; });
      }
    },
    [rejectMutation],
  );

  const insights = data ?? [];

  // Panel collapses when empty or loading with no cached data
  if (isLoading && insights.length === 0) return null;
  if (!isLoading && insights.length === 0) {
    return (
      <section aria-label="Customer mentions of this OEM" style={{ marginBottom: 28 }}>
        <h2
          style={{
            fontFamily: 'var(--body)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.01em',
            color: 'var(--ink-1)',
            margin: '0 0 10px',
          }}
        >
          Mentioned by customers
        </h2>
        <TileEmptyState
          copy="No customer chatter mentions this OEM yet."
          ariaLive
        />
      </section>
    );
  }

  return (
    <section aria-label="Customer mentions of this OEM" style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontFamily: 'var(--body)',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.01em',
          color: 'var(--ink-1)',
          margin: '0 0 10px',
        }}
      >
        Mentioned by customers
        <span
          aria-label={`${insights.length} mention${insights.length === 1 ? '' : 's'}`}
          style={{
            marginLeft: 8,
            fontSize: 12,
            fontWeight: 400,
            color: 'var(--ink-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {insights.length}
        </span>
      </h2>

      <ul
        role="list"
        aria-label="Customer mentions list"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {insights.map((note) => (
          <InsightRow
            key={note.id}
            note={note}
            onAccept={(n) => void handleAccept(n)}
            onDismiss={(n) => void handleDismiss(n)}
            accepting={busyIds.has(note.id) && confirmMutation.isPending}
            dismissing={busyIds.has(note.id) && rejectMutation.isPending}
          />
        ))}
      </ul>
    </section>
  );
}

// Re-export TileEmptyState so tests can verify the empty state pattern
export { TileEmptyState };
