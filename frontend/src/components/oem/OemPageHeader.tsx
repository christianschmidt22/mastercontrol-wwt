/**
 * OemPageHeader.tsx
 *
 * Rich header for the OEM partner detail page.
 * - Large Fraunces org name (h1)
 * - Status pill row: type ('oem'), partner-status chip, last-contact relative time
 * - Two-line "About" from metadata.summary; empty-state CTA when missing
 * - Hairline separator below
 *
 * ≤180 lines per CLAUDE.md component rule.
 */

import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Organization } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a relative "last contact" label from an ISO date string.
 * Returns strings like "just now", "5 min ago", "3 hr ago", "2 days ago".
 * Exported for unit-test coverage.
 */
export function formatLastContact(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Never contacted';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (diffMs < 0) return 'just now';
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'var(--body)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--ink-2)',
        background: 'var(--bg-2)',
        border: '1px solid var(--rule)',
        borderRadius: 4,
        padding: '3px 8px',
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OemPageHeaderProps {
  org: Organization;
  /** ISO date of most recent agent thread last_message_at, or undefined */
  lastThreadAt?: string | null;
  /** ISO date of most recent note created_at, fallback if no thread */
  lastNoteAt?: string | null;
  onEditOrg?: () => void;
  tabs?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OemPageHeader({
  org,
  lastThreadAt,
  lastNoteAt,
  onEditOrg,
  tabs,
}: OemPageHeaderProps) {
  const lastContact = formatLastContact(lastThreadAt ?? lastNoteAt);

  const partnerStatus =
    typeof org.metadata?.partner_status === 'string' && org.metadata.partner_status.trim()
      ? org.metadata.partner_status.trim()
      : null;

  const summary =
    typeof org.metadata?.summary === 'string' && org.metadata.summary.trim()
      ? org.metadata.summary.trim()
      : null;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          maxWidth: 1500,
        }}
      >
        {/* Left: org name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Breadcrumb label */}
          <p
            style={{
              fontFamily: 'var(--body)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              margin: '0 0 8px',
            }}
          >
            OEM Partners
          </p>

          {/* Org name — h1 per heading hierarchy */}
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontWeight: 500,
              fontSize: 'clamp(36px, 4vw, 56px)',
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
              textWrap: 'balance',
              margin: '0 0 12px -6px',
              color: 'var(--ink-1)',
            }}
          >
            {org.name}
          </h1>

          {tabs ? (
            <div style={{ marginBottom: 14 }}>{tabs}</div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <StatusPill label="oem" />
              {partnerStatus && <StatusPill label={partnerStatus} />}
              <span
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 13,
                  color: 'var(--ink-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Last contact {lastContact}
              </span>
            </div>
          )}

          {/* About / summary */}
          {summary ? (
            <p
              style={{
                fontFamily: 'var(--body)',
                fontSize: 14,
                color: 'var(--ink-2)',
                lineHeight: 1.6,
                maxWidth: '72ch',
                margin: 0,
                textWrap: 'pretty',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {summary}
            </p>
          ) : (
            <button
              type="button"
              onClick={onEditOrg}
              style={{
                fontFamily: 'var(--body)',
                fontSize: 13,
                color: 'var(--ink-3)',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Pencil size={13} strokeWidth={1.5} aria-hidden="true" />
              Click to add summary
            </button>
          )}
        </div>

      </div>

      {/* Hairline separator */}
      <div
        aria-hidden="true"
        style={{
          height: 1,
          background: 'var(--rule)',
          marginTop: 20,
          marginBottom: 24,
        }}
      />
    </div>
  );
}
