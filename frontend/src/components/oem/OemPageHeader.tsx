/**
 * OemPageHeader.tsx
 *
 * Rich header for the OEM partner detail page.
 * - Large Fraunces org name (h1)
 * - Status pill row: type ('oem'), partner-status chip, last-contact relative time
 * - Editable OEM note from metadata.summary; empty-state CTA when missing
 * - Hairline separator below
 *
 */

import { Pencil } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useUpdateOrganization } from '../../api/useOrganizations';
import type { Organization } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUMMARY_MAX = 500;

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

interface SummaryEditorProps {
  initial: string;
  onSave: (next: string) => void;
  onCancel: () => void;
}

function SummaryEditor({ initial, onSave, onCancel }: SummaryEditorProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = useCallback(() => {
    if (value.length > SUMMARY_MAX) {
      setError(`Max ${SUMMARY_MAX} chars.`);
      ref.current?.focus();
      return;
    }
    onSave(value);
  }, [value, onSave]);

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: '72ch' }}>
      <textarea
        ref={ref}
        value={value}
        aria-label="OEM note"
        aria-invalid={Boolean(error)}
        placeholder="Add OEM note..."
        rows={2}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError('');
        }}
        onKeyDown={handleKey}
        onBlur={commit}
        style={{
          fontFamily: 'var(--body)',
          fontSize: 14,
          color: 'var(--ink-2)',
          lineHeight: 1.6,
          background: 'var(--bg)',
          border: `1px solid ${error ? 'var(--accent)' : 'var(--rule)'}`,
          borderRadius: 4,
          padding: '6px 8px',
          width: '100%',
          resize: 'vertical',
          outline: 'none',
        }}
      />
      {error && (
        <p
          role="alert"
          aria-live="polite"
          style={{
            color: 'var(--accent)',
            fontFamily: 'var(--body)',
            fontSize: 12,
            margin: '6px 0 0',
          }}
        >
          {error}
        </p>
      )}
      <p
        style={{
          fontFamily: 'var(--body)',
          fontSize: 11,
          color: 'var(--ink-3)',
          margin: '4px 0 0',
        }}
      >
        Esc to cancel · Ctrl/⌘+Enter to save
      </p>
    </div>
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
  tabs?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OemPageHeader({
  org,
  lastThreadAt,
  lastNoteAt,
  tabs,
}: OemPageHeaderProps) {
  const lastContact = formatLastContact(lastThreadAt ?? lastNoteAt);
  const updateOrg = useUpdateOrganization();
  const [editingSummary, setEditingSummary] = useState(false);
  const [hoveredSummary, setHoveredSummary] = useState(false);

  const partnerStatus =
    typeof org.metadata?.partner_status === 'string' && org.metadata.partner_status.trim()
      ? org.metadata.partner_status.trim()
      : null;

  const summary =
    typeof org.metadata?.summary === 'string' && org.metadata.summary.trim()
      ? org.metadata.summary.trim()
      : null;

  const saveSummary = useCallback(
    (next: string) => {
      const current = summary ?? '';
      if (next === current) {
        setEditingSummary(false);
        return;
      }
      updateOrg.mutate({
        id: org.id,
        metadata: { ...(org.metadata ?? {}), summary: next },
      });
      setEditingSummary(false);
    },
    [summary, org.id, org.metadata, updateOrg],
  );

  return (
    <div style={{ marginTop: -10 }}>
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
          {/* Org name — h1 per heading hierarchy */}
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontWeight: 500,
              fontSize: 'clamp(18px, 2.8vw, 42px)',
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
              textWrap: 'balance',
              margin: '0 0 8px -3px',
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

          {/* OEM note / summary */}
          {editingSummary ? (
            <SummaryEditor
              initial={summary ?? ''}
              onSave={saveSummary}
              onCancel={() => setEditingSummary(false)}
            />
          ) : summary ? (
            <button
              type="button"
              aria-label="Edit OEM note"
              onClick={() => setEditingSummary(true)}
              onMouseEnter={() => setHoveredSummary(true)}
              onMouseLeave={() => setHoveredSummary(false)}
              style={{
                fontFamily: 'var(--body)',
                fontSize: 14,
                color: 'var(--ink-2)',
                lineHeight: 1.6,
                maxWidth: '72ch',
                margin: 0,
                textAlign: 'left',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textWrap: 'pretty',
                display: 'block',
              }}
            >
              <span
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {summary}
              </span>
              <Pencil
                size={13}
                strokeWidth={1.5}
                aria-hidden="true"
                style={{
                  color: 'var(--ink-3)',
                  marginLeft: 8,
                  opacity: hoveredSummary ? 1 : 0,
                  transition: 'opacity 120ms var(--ease)',
                  verticalAlign: 'text-bottom',
                }}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditingSummary(true)}
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
              Click to add note
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
