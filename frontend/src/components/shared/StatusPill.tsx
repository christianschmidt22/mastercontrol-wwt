/**
 * StatusPill — shared status chip primitive.
 *
 * Knows the project's full status vocabulary across surfaces:
 *   - Project lifecycle: active / qualifying / paused / won / lost / closed
 *   - Generic backlog: open / done
 *   - Task / scheduled-run: snoozed / failed / running / queued
 *
 * Color choices match the canonical `STATUS_CHIP` map from CustomerPage.tsx:
 *   - green  (#16a34a)       → active, won, done
 *   - blue   (#2563eb)       → qualifying, running, open
 *   - amber  (#c2710c)       → paused, snoozed, queued
 *   - accent (vermilion)     → failed, lost, error
 *   - neutral (ink-3 / bg-2) → closed, unknown
 *
 * Some consumers may intentionally diverge from this palette (e.g.
 * PriorityProjectsTile previously used neutral ink-1 for non-paused
 * statuses to keep the tile quieter). Those are noted at the call site
 * when preserved; otherwise StatusPill harmonizes them. We'll harmonize
 * any remaining divergences in a follow-up pass.
 */

import type { CSSProperties } from 'react';

export interface StatusPillProps {
  status: string;
  size?: 'sm' | 'md';
  tooltip?: string;
}

interface PillStyle {
  color: string;
  bg: string;
}

const GREEN: PillStyle = { color: '#16a34a', bg: 'rgba(22,163,74,0.10)' };
const BLUE: PillStyle = { color: '#2563eb', bg: 'rgba(37,99,235,0.09)' };
const AMBER: PillStyle = { color: '#c2710c', bg: 'rgba(194,113,12,0.12)' };
const ACCENT: PillStyle = { color: 'var(--accent)', bg: 'var(--accent-soft)' };
const NEUTRAL: PillStyle = { color: 'var(--ink-3)', bg: 'var(--bg-2)' };

const STATUS_STYLES: Record<string, PillStyle> = {
  active: GREEN,
  won: GREEN,
  done: GREEN,
  qualifying: BLUE,
  running: BLUE,
  open: BLUE,
  paused: AMBER,
  snoozed: AMBER,
  queued: AMBER,
  failed: ACCENT,
  lost: ACCENT,
  error: ACCENT,
  closed: NEUTRAL,
  unknown: NEUTRAL,
};

const SIZE_STYLES: Record<NonNullable<StatusPillProps['size']>, CSSProperties> = {
  sm: { padding: '2px 8px', fontSize: 10, letterSpacing: '0.06em' },
  md: { padding: '3px 10px', fontSize: 11, letterSpacing: '0.04em' },
};

export function StatusPill({ status, size = 'md', tooltip }: StatusPillProps) {
  const normalized = status.toLowerCase();
  const { color, bg } = STATUS_STYLES[normalized] ?? NEUTRAL;
  const sizeStyle = SIZE_STYLES[size];

  return (
    <span
      title={tooltip}
      aria-label={tooltip ?? `Status: ${normalized}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 99,
        fontWeight: 600,
        fontFamily: 'var(--body)',
        textTransform: 'capitalize',
        color,
        background: bg,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        ...sizeStyle,
      }}
    >
      {normalized}
    </span>
  );
}
