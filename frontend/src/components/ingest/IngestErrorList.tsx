/**
 * IngestErrorList
 *
 * Renders ingest error rows (file path, error reason, timestamp) with a
 * per-row Retry button that calls POST /api/ingest/errors/:id/retry.
 *
 * Accessibility: role="status" + aria-live="polite" on the list container so
 * new errors (and the disappearance of resolved ones) announce to screen
 * readers.
 *
 * Design: DESIGN.md hairlines, mono paths, no shadows. ≤150 lines.
 */

import { RotateCcw, Loader2 } from 'lucide-react';
import { TileEmptyState } from '../tiles/TileEmptyState';
import { useRetryIngestError } from '../../api/useIngest';
import type { IngestError } from '../../types/ingest';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatOccurred(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Truncate a path from the left so the filename is always visible. */
function truncatePath(p: string, max = 48): string {
  if (p.length <= max) return p;
  return `…${p.slice(-(max - 1))}`;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface ErrorRowProps {
  err: IngestError;
  onRetry: (id: number) => void;
  isRetrying: boolean;
}

function ErrorRow({ err, onRetry, isRetrying }: ErrorRowProps) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          title={err.path}
          translate="no"
          style={{
            display: 'block',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: 'var(--ink-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {truncatePath(err.path)}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--ink-2)',
            marginTop: 2,
            fontFamily: 'var(--body)',
            lineHeight: 1.4,
          }}
        >
          {err.error}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 11,
            color: 'var(--ink-3)',
            marginTop: 2,
            fontFamily: 'var(--body)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatOccurred(err.occurred_at)}
        </span>
      </div>

      <button
        type="button"
        disabled={isRetrying}
        onClick={() => onRetry(err.id)}
        aria-label={isRetrying ? `Retrying ${err.path}…` : `Retry ${err.path}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 6,
          border: '1px solid var(--rule)',
          background: 'transparent',
          color: 'var(--ink-2)',
          cursor: isRetrying ? 'default' : 'pointer',
          opacity: isRetrying ? 0.5 : 1,
          transition: 'opacity 150ms var(--ease)',
        }}
      >
        {isRetrying ? (
          <Loader2 size={13} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />
        ) : (
          <RotateCcw size={13} strokeWidth={1.5} aria-hidden="true" />
        )}
      </button>
    </li>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface IngestErrorListProps {
  errors: IngestError[] | undefined;
  isLoading: boolean;
}

export function IngestErrorList({ errors, isLoading }: IngestErrorListProps) {
  const retry = useRetryIngestError();

  if (isLoading) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}>
        Loading…
      </p>
    );
  }

  if (!errors || errors.length === 0) {
    return (
      <TileEmptyState
        copy="No ingest errors — all files processed successfully."
        ariaLive
      />
    );
  }

  return (
    <div role="status" aria-live="polite" aria-label="Ingest errors">
      <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {errors.map((err) => (
          <ErrorRow
            key={err.id}
            err={err}
            onRetry={(id) => retry.mutate(id)}
            isRetrying={retry.isPending && retry.variables === err.id}
          />
        ))}
      </ul>
    </div>
  );
}
