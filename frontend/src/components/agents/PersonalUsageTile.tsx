/**
 * PersonalUsageTile — subscription overview strip above the agents tab strip.
 *
 * IA decision: Option B (persistent header strip above all tabs).
 * Rationale: usage stats are always relevant context for the agents page
 * regardless of which tab is active; a dedicated tab would bury them and
 * require extra navigation. Adding above the tab strip avoids any churn
 * in existing TabStrip tests.
 *
 * Design:
 *  - Hairline borders only (no shadows), warm-paper tokens.
 *  - Tabular numerals for all numeric values.
 *  - Vermilion only on the primary Settings CTA.
 *  - "Recent activity" disclosure is a real <button aria-expanded>.
 *  - prefers-reduced-motion: chevron does not animate.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useSetting } from '../../api/useSettings';
import { useUsage, useRecentUsage } from '../../api/useSubagent';
import type { UsagePeriod, UsageEvent } from '../../types/subagent';

// ---------------------------------------------------------------------------
// Cost formatting
// ---------------------------------------------------------------------------

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function costAriaLabel(usd: number): string {
  return `${usd.toFixed(6)} US dollars`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Period tab strip (inner, scoped to this tile)
// ---------------------------------------------------------------------------

const PERIODS: { id: UsagePeriod; label: string }[] = [
  { id: 'session', label: 'Session' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'all', label: 'All time' },
];

// ---------------------------------------------------------------------------
// Skeleton placeholder bar
// ---------------------------------------------------------------------------

function SkeletonBar({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: 3,
        background: 'var(--ink-3)',
        opacity: 0.2,
        verticalAlign: 'middle',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Source pill
// ---------------------------------------------------------------------------

function SourcePill({ source }: { source: UsageEvent['source'] }) {
  const LABEL: Record<UsageEvent['source'], string> = {
    chat: 'chat',
    delegate: 'delegate',
    report: 'report',
    ingest: 'ingest',
    other: 'other',
  };
  return (
    <span
      style={{
        fontSize: 11,
        fontFamily: 'var(--body)',
        fontWeight: 500,
        padding: '1px 6px',
        borderRadius: 3,
        border: '1px solid var(--rule)',
        color: 'var(--ink-2)',
        background: 'var(--bg-2)',
        flexShrink: 0,
      }}
    >
      {LABEL[source]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PeriodPanel — stats for one usage period
// ---------------------------------------------------------------------------

function PeriodPanel({ period }: { period: UsagePeriod }) {
  const { data, isLoading } = useUsage(period);

  if (isLoading || !data) {
    return (
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {(['Requests', 'Tokens', 'Cost'] as const).map((label) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--body)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
            <SkeletonBar width={48} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Stat label="Requests" value={String(data.requests)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--body)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tokens</span>
        <span style={{ fontFamily: 'var(--body)', fontSize: 18, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-1)', fontWeight: 500 }}>
          {formatTokens(data.total_tokens)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--body)', fontVariantNumeric: 'tabular-nums' }}>
          {formatTokens(data.input_tokens)} in / {formatTokens(data.output_tokens)} out
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--body)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cost</span>
        <span
          style={{ fontFamily: 'var(--body)', fontSize: 18, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-1)', fontWeight: 500 }}
          aria-label={costAriaLabel(data.cost_usd)}
        >
          {formatCost(data.cost_usd)}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--body)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontFamily: 'var(--body)', fontSize: 18, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-1)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecentActivity disclosure
// ---------------------------------------------------------------------------

function RecentActivity() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useRecentUsage(10);

  return (
    <div style={{ borderTop: '1px solid var(--rule)', marginTop: 16, paddingTop: 12 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: 12,
          fontFamily: 'var(--body)',
          fontWeight: 500,
          color: 'var(--ink-2)',
          letterSpacing: '0.04em',
        }}
      >
        Recent activity
        <ChevronDown
          size={13}
          strokeWidth={1.5}
          aria-hidden="true"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            /* Respect prefers-reduced-motion */
            transition: 'transform 200ms var(--ease)',
          }}
          className="motion-safe:transition-transform"
        />
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {isLoading || !data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map((i) => (
                <SkeletonBar key={i} width="100%" height={20} />
              ))}
            </div>
          ) : data.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}>No recent activity.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} role="list">
              {data.map((evt, idx) => (
                <li
                  key={evt.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px 72px 1fr auto auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '7px 0',
                    borderTop: idx > 0 ? '1px solid var(--rule)' : 'none',
                    fontSize: 12,
                    fontFamily: 'var(--body)',
                    color: 'var(--ink-2)',
                  }}
                >
                  <span style={{ color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {relativeTime(evt.occurred_at)}
                  </span>
                  <SourcePill source={evt.source} />
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-2)' }}
                    title={evt.model}
                  >
                    {evt.model}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>
                    {formatTokens(evt.input_tokens + evt.output_tokens)}
                  </span>
                  <span
                    style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}
                    aria-label={costAriaLabel(evt.cost_usd)}
                  >
                    {formatCost(evt.cost_usd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonalUsageTile — exported component
// ---------------------------------------------------------------------------

export function PersonalUsageTile() {
  const [activePeriod, setActivePeriod] = useState<UsagePeriod>('session');

  // Determine whether a personal key is configured by checking for a masked value
  const { data: keyData, isLoading: keyLoading } = useSetting('personal_anthropic_api_key');
  const hasKey = !keyLoading && !!keyData?.value && keyData.value.length > 0;

  const statusDotColor = hasKey ? '#4ade80' : 'var(--ink-3)';
  const statusLabel = hasKey ? 'Personal subscription active' : 'No personal subscription key configured';

  return (
    <section
      aria-labelledby="personal-usage-heading"
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 8,
        background: 'var(--bg)',
        padding: '20px 24px',
        marginBottom: 28,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span
          role="img"
          aria-label={statusLabel}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusDotColor,
            flexShrink: 0,
            display: 'inline-block',
          }}
        />
        <h2
          id="personal-usage-heading"
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'var(--body)',
            color: 'var(--ink-1)',
            margin: 0,
            letterSpacing: '0.01em',
          }}
        >
          Personal subscription
        </h2>
      </div>

      {/* Empty state when no key */}
      {!keyLoading && !hasKey ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--body)', margin: 0 }}>
            No personal subscription configured.
          </p>
          <Link
            to="/settings#section-personal-subscription"
            style={{
              fontSize: 13,
              fontFamily: 'var(--body)',
              color: 'var(--accent)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Configure in Settings
          </Link>
        </div>
      ) : (
        <>
          {/* Period inner tab strip */}
          <div
            role="tablist"
            aria-label="Usage period"
            style={{
              display: 'flex',
              gap: 0,
              borderBottom: '1px solid var(--rule)',
              marginBottom: 16,
            }}
          >
            {PERIODS.map((p) => {
              const isActive = p.id === activePeriod;
              return (
                <button
                  key={p.id}
                  id={`usage-tab-${p.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`usage-panel-${p.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActivePeriod(p.id)}
                  style={{
                    position: 'relative',
                    padding: '6px 14px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'var(--body)',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
                    transition: 'color 200ms var(--ease)',
                  }}
                >
                  {p.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        bottom: -1,
                        left: 0,
                        right: 0,
                        height: 2,
                        background: 'var(--ink-1)',
                        borderRadius: '2px 2px 0 0',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Period panel */}
          {PERIODS.map((p) => (
            <div
              key={p.id}
              id={`usage-panel-${p.id}`}
              role="tabpanel"
              aria-labelledby={`usage-tab-${p.id}`}
              hidden={p.id !== activePeriod}
            >
              {p.id === activePeriod && <PeriodPanel period={p.id} />}
            </div>
          ))}

          <RecentActivity />
        </>
      )}
    </section>
  );
}
