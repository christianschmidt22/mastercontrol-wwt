/**
 * IngestStatusPanel
 *
 * Shows the last scan timestamp, files-scanned count, error count, and a
 * "Scan Now" button that triggers a full WorkVault walk.
 *
 * Design: DESIGN.md "Field Notes" — hairlines, no shadows, vermilion only on
 * the primary CTA (the one rest-state accent budget for this panel).
 * ≤150 lines.
 */

import { Loader2, RefreshCw } from 'lucide-react';
import { useIngestStatus, useIngestScan } from '../../api/useIngest';
import type { ScanResult } from '../../types/ingest';

// ─── Stat row ─────────────────────────────────────────────────────────────────

interface StatRowProps {
  label: string;
  value: string;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
      <dt
        style={{
          fontFamily: 'var(--body)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--ink-2)',
          minWidth: 120,
          flexShrink: 0,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          fontFamily: 'var(--body)',
          fontSize: 14,
          color: 'var(--ink-1)',
          margin: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLastScan(isoOrNull: string | null): string {
  if (!isoOrNull) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoOrNull));
}

function toastSummary(r: ScanResult): string {
  const parts = [
    r.inserted > 0 && `${r.inserted} inserted`,
    r.updated > 0 && `${r.updated} updated`,
    r.tombstoned > 0 && `${r.tombstoned} removed`,
    r.errors > 0 && `${r.errors} error${r.errors !== 1 ? 's' : ''}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : `${r.files_scanned} files checked, no changes`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IngestStatusPanel() {
  const { data, isLoading } = useIngestStatus();
  const scan = useIngestScan();

  const source = data?.source ?? null;
  const errorCount = data?.errors.length ?? 0;

  const lastScan = formatLastScan(source?.last_scan_at ?? null);

  return (
    <div
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 8,
        padding: 24,
        background: 'var(--bg)',
      }}
    >
      <dl
        style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0, marginBottom: 20 }}
        aria-label="Ingest scan statistics"
      >
        <StatRow label="Last scan" value={isLoading ? '…' : lastScan} />
        <StatRow
          label="Errors"
          value={isLoading ? '…' : errorCount === 0 ? 'None' : String(errorCount)}
        />
        {scan.isSuccess && scan.data && (
          <StatRow label="Last run" value={toastSummary(scan.data)} />
        )}
      </dl>

      {scan.isError && (
        <p
          role="alert"
          style={{
            fontSize: 13,
            color: 'var(--accent)',
            fontFamily: 'var(--body)',
            marginBottom: 12,
          }}
        >
          {scan.error.message}
        </p>
      )}

      <button
        type="button"
        disabled={scan.isPending}
        onClick={() => scan.mutate()}
        aria-label={scan.isPending ? 'Scan in progress…' : 'Scan WorkVault now'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--body)',
          fontSize: 13,
          fontWeight: 500,
          padding: '8px 18px',
          borderRadius: 6,
          cursor: scan.isPending ? 'default' : 'pointer',
          border: '1px solid var(--accent)',
          background: 'var(--bg)',
          color: 'var(--ink-1)',
          opacity: scan.isPending ? 0.6 : 1,
          transition: 'opacity 150ms var(--ease)',
        }}
      >
        {scan.isPending ? (
          <Loader2 size={14} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />
        ) : (
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" />
        )}
        {scan.isPending ? 'Scanning…' : 'Scan Now'}
      </button>
    </div>
  );
}
