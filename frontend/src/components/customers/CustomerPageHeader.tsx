/**
 * CustomerPageHeader.tsx
 *
 * Rich header for the customer detail page.
 * - Large Fraunces org name (h1) — click to edit in place
 * - Status pill row: type, last-touched relative time
 * - Two-line "About" (metadata.summary) — click to edit in place
 * - Hairline separator below
 *
 * Edit-in-place: clicking the org name turns it into a styled <input>;
 * Enter or blur saves via useUpdateOrganization with optimistic update,
 * Esc reverts. Same pattern for the summary (textarea). A hover-visible
 * pencil icon makes the affordance discoverable.
 *
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Pencil } from 'lucide-react';
import { useUpdateOrganization } from '../../api/useOrganizations';
import type { Organization } from '../../types';

// ---------------------------------------------------------------------------
// Validation limits
// ---------------------------------------------------------------------------

const NAME_MAX = 200;
const SUMMARY_MAX = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a relative "last touched" label from an ISO date string.
 * Returns strings like "just now", "5 min ago", "3 hr ago", "2 days ago".
 * Exported for unit-test coverage.
 */
export function formatLastTouched(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Never touched';
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
// NameEditor — click-to-edit org name, Enter/blur saves, Esc cancels
// ---------------------------------------------------------------------------

interface NameEditorProps {
  initial: string;
  onSave: (next: string) => void;
  onCancel: () => void;
}

function NameEditor({ initial, onSave, onCancel }: NameEditorProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Name is required.');
      ref.current?.focus();
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setError(`Max ${NAME_MAX} chars.`);
      ref.current?.focus();
      return;
    }
    onSave(trimmed);
  }, [value, onSave]);

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={ref}
        type="text"
        value={value}
        aria-label="Organization name"
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError('');
        }}
        onKeyDown={handleKey}
        onBlur={commit}
        style={{
          fontFamily: 'var(--display)',
          fontWeight: 500,
          fontSize: 'clamp(18px, 2.8vw, 42px)',
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          color: 'var(--ink-1)',
          background: 'transparent',
          border: 'none',
          borderBottom: `1px solid ${error ? 'var(--accent)' : 'var(--rule)'}`,
          padding: '0 0 4px',
          margin: 0,
          width: '100%',
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryEditor — click-to-edit summary, Enter/blur saves, Esc cancels
// ---------------------------------------------------------------------------

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
    // Cmd/Ctrl+Enter saves; plain Enter inserts newline (textarea convention)
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
        aria-label="Organization summary"
        aria-invalid={Boolean(error)}
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

export interface CustomerPageHeaderProps {
  org: Organization;
  /** ISO date of most recent agent thread last_message_at, or undefined */
  lastThreadAt?: string | null;
  /** ISO date of most recent note created_at, fallback if no thread */
  lastNoteAt?: string | null;
  tabs?: ReactNode;
  summaryOverride?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NAME_DISPLAY_STYLE: CSSProperties = {
  fontFamily: 'var(--display)',
  fontWeight: 500,
  fontSize: 'clamp(18px, 2.8vw, 42px)',
  lineHeight: 1.02,
  letterSpacing: '-0.02em',
  marginLeft: -3,
  textWrap: 'balance',
  margin: '0 0 8px -3px',
  color: 'var(--ink-1)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 12,
  background: 'none',
  border: 'none',
  padding: 0,
  textAlign: 'left',
};

export function CustomerPageHeader({
  org,
  lastThreadAt,
  lastNoteAt,
  tabs,
  summaryOverride,
}: CustomerPageHeaderProps) {
  const lastTouched = formatLastTouched(lastThreadAt ?? lastNoteAt);
  const summary =
    typeof org.metadata?.summary === 'string' && org.metadata.summary.trim()
      ? org.metadata.summary.trim()
      : '';

  const updateOrg = useUpdateOrganization();
  const [editingName, setEditingName] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [hovered, setHovered] = useState<'name' | 'summary' | null>(null);

  const saveName = useCallback(
    (next: string) => {
      if (next === org.name) {
        setEditingName(false);
        return;
      }
      updateOrg.mutate({ id: org.id, name: next });
      setEditingName(false);
    },
    [org.id, org.name, updateOrg],
  );

  const saveSummary = useCallback(
    (next: string) => {
      const cur = summary;
      if (next === cur) {
        setEditingSummary(false);
        return;
      }
      // Preserve other metadata fields; only update summary.
      const nextMetadata = { ...(org.metadata ?? {}), summary: next };
      updateOrg.mutate({ id: org.id, metadata: nextMetadata });
      setEditingSummary(false);
    },
    [summary, org.id, org.metadata, updateOrg],
  );

  return (
    <div style={{ width: '100%', marginTop: -10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          {/* Org name — click to edit */}
          {editingName ? (
            <NameEditor
              initial={org.name}
              onSave={saveName}
              onCancel={() => setEditingName(false)}
            />
          ) : (
            <h1 style={{ margin: '0 0 12px', padding: 0 }}>
              <button
                type="button"
                aria-label={`${org.name} — click to edit name`}
                onClick={() => setEditingName(true)}
                onMouseEnter={() => setHovered('name')}
                onMouseLeave={() => setHovered(null)}
                style={NAME_DISPLAY_STYLE}
              >
                <span>{org.name}</span>
                <Pencil
                  size={18}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  style={{
                    color: 'var(--ink-3)',
                    opacity: hovered === 'name' ? 1 : 0,
                    transition: 'opacity 120ms var(--ease)',
                    flexShrink: 0,
                  }}
                />
              </button>
            </h1>
          )}

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
              <StatusPill label={org.type} />
              <span
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 13,
                  color: 'var(--ink-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Last touched {lastTouched}
              </span>
            </div>
          )}

          {/* About / summary — click to edit */}
          {summaryOverride !== undefined ? (
            <div style={{ maxWidth: '72ch' }}>{summaryOverride}</div>
          ) : editingSummary ? (
            <SummaryEditor
              initial={summary}
              onSave={saveSummary}
              onCancel={() => setEditingSummary(false)}
            />
          ) : summary ? (
            <button
              type="button"
              aria-label="Edit summary"
              onClick={() => setEditingSummary(true)}
              onMouseEnter={() => setHovered('summary')}
              onMouseLeave={() => setHovered(null)}
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
                display: 'block',
                textWrap: 'pretty',
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
                size={12}
                strokeWidth={1.5}
                aria-hidden="true"
                style={{
                  color: 'var(--ink-3)',
                  opacity: hovered === 'summary' ? 1 : 0,
                  transition: 'opacity 120ms var(--ease)',
                  marginLeft: 6,
                  verticalAlign: 'middle',
                }}
              />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Add summary"
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
