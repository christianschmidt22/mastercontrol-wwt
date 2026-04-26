/**
 * SourcePathConfig
 *
 * Lists configured ingest sources with middle-truncated paths (full path in
 * title= for hover). Read-only path display; shows kind badge and last-scan
 * timestamp per source.
 *
 * Design: DESIGN.md hairlines, mono paths, no shadows. ≤150 lines.
 */

import { FolderOpen } from 'lucide-react';
import { TileEmptyState } from '../tiles/TileEmptyState';
import type { IngestSource } from '../../types/ingest';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Middle-truncate a path so it fits in narrow columns (≤40 chars visible). */
function truncateMid(p: string, max = 40): string {
  if (p.length <= max) return p;
  const half = Math.floor((max - 1) / 2);
  return `${p.slice(0, half)}…${p.slice(-half)}`;
}

function formatScanTime(isoOrNull: string | null): string {
  if (!isoOrNull) return 'Never scanned';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoOrNull));
}

const KIND_LABELS: Record<string, string> = {
  workvault: 'WorkVault',
  onedrive: 'OneDrive',
  oem_docs: 'OEM Docs',
};

// ─── Row ──────────────────────────────────────────────────────────────────────

interface SourceRowProps {
  source: IngestSource;
}

function SourceRow({ source }: SourceRowProps) {
  const kindLabel = KIND_LABELS[source.kind] ?? source.kind;

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
      <FolderOpen
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        style={{ color: 'var(--ink-3)', marginTop: 2, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Path — mono font, middle-truncated, full path on hover */}
        <span
          title={source.root_path}
          translate="no"
          style={{
            display: 'block',
            fontFamily: 'var(--mono)',
            fontSize: 13,
            color: 'var(--ink-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {truncateMid(source.root_path)}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--ink-3)',
            marginTop: 2,
            fontFamily: 'var(--body)',
          }}
        >
          {kindLabel} &middot; {formatScanTime(source.last_scan_at)}
        </span>
      </div>
    </li>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SourcePathConfigProps {
  sources: IngestSource[] | undefined;
  isLoading: boolean;
}

export function SourcePathConfig({ sources, isLoading }: SourcePathConfigProps) {
  if (isLoading) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}>
        Loading sources…
      </p>
    );
  }

  if (!sources || sources.length === 0) {
    return (
      <TileEmptyState
        copy="No ingest sources configured. Set a WorkVault root in Note Sources above and trigger a scan."
        ariaLive
      />
    );
  }

  return (
    <ul
      role="list"
      aria-label="Configured ingest sources"
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {sources.map((src) => (
        <SourceRow key={src.id} source={src} />
      ))}
    </ul>
  );
}
