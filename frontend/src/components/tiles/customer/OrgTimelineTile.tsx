/**
 * OrgTimelineTile — full interaction history for an org, most-recent-first.
 *
 * Notes are grouped by calendar day with a vertical hairline timeline.
 * Per-role rendering per DESIGN.md:
 *   user         → standard text, vermilion dot, 'You' label
 *   assistant    → var(--bg-2) monospace block, 'Agent' label, no dot
 *   agent_insight → 'Insight' chip, Accept/Dismiss if confirmed=false
 *   imported     → dashed card, source_path filename, 'From WorkVault' label
 */

import { useState, type ReactNode } from 'react';
import { Check, X, ChevronDown } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Note } from '../../../types';

const PAGE_SIZE = 30;

// ─── Narrow hook injection interfaces ─────────────────────────────────────────

interface UseNotesResult {
  data: Note[] | undefined;
  isLoading: boolean;
}

interface InsightMutator {
  mutate: (vars: { id: number; orgId: number }) => void;
}

function useNotesStub(_id: number, _opts?: { includeUnconfirmed?: boolean }): UseNotesResult {
  return { data: undefined, isLoading: false };
}

function useInsightStub(): InsightMutator {
  return { mutate: () => {} };
}

export interface OrgTimelineTileProps {
  orgId: number;
  _useNotes?: (id: number, opts?: { includeUnconfirmed?: boolean }) => UseNotesResult;
  _useConfirmInsight?: () => InsightMutator;
  _useRejectInsight?: () => InsightMutator;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

/** Returns a YYYY-MM-DD string in local time — stable date key for grouping. */
function toDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA');
}

function makeDateLabel(key: string): string {
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  // e.g. "Tue Apr 22"
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .format(new Date(`${key}T12:00:00`));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(iso));
}

interface DateGroup {
  key: string;
  label: string;
  notes: Note[];
}

function groupByDate(notes: Note[]): DateGroup[] {
  const map = new Map<string, Note[]>();
  for (const note of notes) {
    const key = toDateKey(note.created_at);
    const existing = map.get(key);
    if (existing) existing.push(note);
    else map.set(key, [note]);
  }
  return Array.from(map.entries()).map(([key, groupNotes]) => ({
    key,
    label: makeDateLabel(key),
    notes: groupNotes,
  }));
}

// ─── Shared meta row (role label + timestamp) ─────────────────────────────────

function MetaRow({ label, iso, chip }: { label: string; iso: string; chip?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      {chip ?? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
          }}
        >
          {label}
        </span>
      )}
      <time
        dateTime={iso}
        style={{ fontSize: 11, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}
      >
        {formatTime(iso)}
      </time>
    </div>
  );
}

// ─── Vermilion dot — appears on timeline hairline for user + agent_insight ────

function MarkerDot() {
  return (
    <span
      role="img"
      aria-label="Timeline marker"
      style={{
        position: 'absolute',
        left: -13,
        top: 5,
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--accent)',
        display: 'block',
        flexShrink: 0,
      }}
    />
  );
}

// ─── Per-role row components ───────────────────────────────────────────────────

function UserRow({ note }: { note: Note }) {
  return (
    <li style={{ position: 'relative' }}>
      <MarkerDot />
      <MetaRow label="You" iso={note.created_at} />
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-1)' }}>
        {note.content}
      </p>
    </li>
  );
}

function AssistantRow({ note }: { note: Note }) {
  return (
    <li>
      <MetaRow label="Agent" iso={note.created_at} />
      <pre
        style={{
          margin: 0,
          padding: '8px 10px',
          background: 'var(--bg-2)',
          border: '1px solid var(--rule)',
          borderRadius: 4,
          fontSize: 13,
          fontFamily: 'var(--mono)',
          lineHeight: 1.6,
          color: 'var(--ink-2)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {note.content}
      </pre>
    </li>
  );
}

function InsightRow({
  note,
  orgId,
  onConfirm,
  onReject,
}: {
  note: Note;
  orgId: number;
  onConfirm: (v: { id: number; orgId: number }) => void;
  onReject: (v: { id: number; orgId: number }) => void;
}) {
  const isUnconfirmed = !note.confirmed;

  const chip = (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        color: 'var(--accent)',
        background: 'var(--accent-soft)',
        borderRadius: 3,
        padding: '1px 5px',
        fontFamily: 'var(--body)',
      }}
    >
      Insight
    </span>
  );

  return (
    <li style={{ position: 'relative' }}>
      <MarkerDot />
      <MetaRow label="Insight" iso={note.created_at} chip={chip} />
      <p style={{ margin: '0 0 6px', fontSize: 14, lineHeight: 1.55, color: 'var(--ink-1)' }}>
        {note.content}
      </p>
      {isUnconfirmed && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => onConfirm({ id: note.id, orgId })}
            aria-label="Accept insight"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 4,
              padding: '3px 9px',
              fontSize: 11,
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'var(--body)',
            }}
          >
            <Check size={10} strokeWidth={2} aria-hidden="true" />
            Accept
          </button>
          <button
            type="button"
            onClick={() => onReject({ id: note.id, orgId })}
            aria-label="Dismiss insight"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: '1px solid var(--rule)',
              borderRadius: 4,
              padding: '3px 9px',
              fontSize: 11,
              color: 'var(--ink-2)',
              cursor: 'pointer',
              fontFamily: 'var(--body)',
            }}
          >
            <X size={10} strokeWidth={2} aria-hidden="true" />
            Dismiss
          </button>
        </div>
      )}
    </li>
  );
}

function ImportedRow({ note }: { note: Note }) {
  const sourceName = note.source_path
    ? (note.source_path.split(/[/\\]/).pop() ?? note.source_path)
    : null;

  return (
    <li>
      <div
        style={{
          border: '1px dashed var(--rule)',
          borderRadius: 6,
          padding: '10px 12px',
        }}
      >
        <MetaRow label="From WorkVault" iso={note.created_at} />
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-1)' }}>
          {note.content}
        </p>
        {sourceName && (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--mono)',
            }}
          >
            {sourceName}
          </p>
        )}
      </div>
    </li>
  );
}

// ─── NoteRow — dispatches to the correct role component ───────────────────────

function NoteRow({
  note,
  orgId,
  onConfirm,
  onReject,
}: {
  note: Note;
  orgId: number;
  onConfirm: (v: { id: number; orgId: number }) => void;
  onReject: (v: { id: number; orgId: number }) => void;
}) {
  switch (note.role) {
    case 'user':
      return <UserRow note={note} />;
    case 'assistant':
      return <AssistantRow note={note} />;
    case 'agent_insight':
      return (
        <InsightRow
          note={note}
          orgId={orgId}
          onConfirm={onConfirm}
          onReject={onReject}
        />
      );
    case 'imported':
      return <ImportedRow note={note} />;
    default:
      return <UserRow note={note} />;
  }
}

// ─── Main exported tile ────────────────────────────────────────────────────────

export function OrgTimelineTile({
  orgId,
  _useNotes = useNotesStub,
  _useConfirmInsight = useInsightStub,
  _useRejectInsight = useInsightStub,
}: OrgTimelineTileProps) {
  const { data, isLoading } = _useNotes(orgId, { includeUnconfirmed: true });
  const { mutate: confirmInsight } = _useConfirmInsight();
  const { mutate: rejectInsight } = _useRejectInsight();

  const [shown, setShown] = useState(PAGE_SIZE);

  const allNotes = data ?? [];
  const visible = allNotes.slice(0, shown);
  const remaining = allNotes.length - shown;
  const groups = groupByDate(visible);

  return (
    <Tile
      title="Notes Timeline"
      count={isLoading ? '…' : allNotes.length || undefined}
    >
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && allNotes.length === 0 && (
        <TileEmptyState
          copy="No notes yet — start a conversation in the Chat tile or add one via Recent Notes."
          ariaLive
        />
      )}

      {!isLoading && allNotes.length > 0 && (
        <div style={{ position: 'relative', paddingLeft: 20 }}>
          {/* Vertical timeline hairline — runs the full height of the list */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 7,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'var(--rule)',
            }}
          />

          {groups.map((group, gi) => (
            <div key={group.key}>
              {/* Date heading — 11px uppercase letterspaced per DESIGN.md */}
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  fontWeight: 500,
                  fontFamily: 'var(--body)',
                  margin: gi === 0 ? '0 0 10px' : '18px 0 10px',
                }}
              >
                {group.label}
              </p>

              <ol
                aria-label={`Notes from ${group.label}`}
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                {group.notes.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    orgId={orgId}
                    onConfirm={confirmInsight}
                    onReject={rejectInsight}
                  />
                ))}
              </ol>
            </div>
          ))}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE_SIZE)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 18,
                background: 'transparent',
                border: '1px solid var(--rule)',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
              Show {remaining} more
            </button>
          )}
        </div>
      )}
    </Tile>
  );
}
