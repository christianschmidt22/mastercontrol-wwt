import { useState, useCallback, type CSSProperties } from 'react';
import { Check, X } from 'lucide-react';
import { Tile } from '../Tile';
import type { Note } from '../../../types';

interface UseNotesResult {
  data: Note[] | undefined;
  isLoading: boolean;
}

interface UseInsightMutations {
  confirm: (noteId: number) => void;
  reject: (noteId: number) => void;
}

function useNotesStub(_orgId: number, _options?: { includeUnconfirmed?: boolean }): UseNotesResult {
  return { data: undefined, isLoading: false };
}

function useInsightMutationsStub(): UseInsightMutations {
  return { confirm: (_id: number) => {}, reject: (_id: number) => {} };
}

interface RecentNotesTileProps {
  orgId: number;
  _useNotes?: (orgId: number, options?: { includeUnconfirmed?: boolean }) => UseNotesResult;
  _useConfirmInsight?: () => { mutate: (noteId: number) => void };
  _useRejectInsight?: () => { mutate: (noteId: number) => void };
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

/**
 * Row for a single note. agent_insight rows get:
 * - 4px vermilion dot to the left of the timestamp (per DESIGN.md § Notes/Chat tile)
 * - inline Accept/Dismiss bar if not yet confirmed (Q-4)
 */
function NoteRow({
  note,
  onConfirm,
  onReject,
}: {
  note: Note;
  onConfirm: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isInsight = note.role === 'agent_insight';
  const isUnconfirmed = isInsight && !note.confirmed;
  const shouldClamp = !expanded && note.content.length > 300;

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr',
        gap: 12,
        alignItems: 'start',
        position: 'relative',
      }}
    >
      {/* Vermilion dot for agent_insight — left of timestamp, transient signal per Q-1 */}
      {isInsight && (
        <span
          aria-hidden="true"
          title="Agent insight"
          style={{
            position: 'absolute',
            left: -10,
            top: 4,
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--accent)',
            flexShrink: 0,
          }}
        />
      )}

      <time
        dateTime={note.created_at}
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
          paddingTop: 2,
        }}
      >
        {formatTimestamp(note.created_at)}
      </time>

      <div>
        <p
          style={
            {
              fontSize: 14,
              lineHeight: 1.55,
              color: isInsight ? 'var(--ink-2)' : 'var(--ink-1)',
              margin: 0,
              maxWidth: '70ch',
              overflow: shouldClamp ? 'hidden' : 'visible',
              display: shouldClamp ? '-webkit-box' : 'block',
              WebkitLineClamp: shouldClamp ? 3 : undefined,
              WebkitBoxOrient: shouldClamp ? 'vertical' : undefined,
            } as CSSProperties
          }
        >
          {note.content}
        </p>
        {note.content.length > 300 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              color: 'var(--ink-3)',
              cursor: 'pointer',
              fontFamily: 'var(--body)',
              marginTop: 4,
            }}
          >
            Read more
          </button>
        )}

        {/* Inline Accept/Dismiss for unconfirmed agent insights (Q-4) */}
        {isUnconfirmed && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 6,
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => onConfirm(note.id)}
              aria-label="Accept insight"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'transparent',
                border: '1px solid var(--rule)',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 11,
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              <Check size={10} strokeWidth={2} aria-hidden="true" />
              Accept
            </button>
            <button
              type="button"
              onClick={() => onReject(note.id)}
              aria-label="Dismiss insight"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'transparent',
                border: '1px solid var(--rule)',
                borderRadius: 4,
                padding: '2px 8px',
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
      </div>
    </li>
  );
}

/**
 * RecentNotesTile — recent notes + agent insights for the org.
 *
 * Note list: timestamp gutter 80px + content 70ch max.
 * Unconfirmed agent_insight rows get inline accept/dismiss (Q-4).
 */
export function RecentNotesTile({ orgId, _useNotes, _useConfirmInsight, _useRejectInsight }: RecentNotesTileProps) {
  const useNotes = _useNotes ?? useNotesStub;
  const { data: notes, isLoading } = useNotes(orgId, { includeUnconfirmed: true });

  const useConfirmInsight = _useConfirmInsight ?? (() => ({ mutate: (_id: number) => {} }));
  const useRejectInsight = _useRejectInsight ?? (() => ({ mutate: (_id: number) => {} }));

  const { mutate: confirmInsight } = useConfirmInsight();
  const { mutate: rejectInsight } = useRejectInsight();

  const handleConfirm = useCallback((id: number) => confirmInsight(id), [confirmInsight]);
  const handleReject = useCallback((id: number) => rejectInsight(id), [rejectInsight]);

  const noteList = notes ?? [];

  return (
    <Tile title="Recent Notes" count={isLoading ? '…' : noteList.length || undefined}>
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && noteList.length === 0 && (
        <div
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 6,
            padding: '16px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-2)',
          }}
        >
          No notes yet — start chatting with the agent to capture notes.
        </div>
      )}

      {noteList.length > 0 && (
        <ul
          role="list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '0 0 0 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {noteList.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onConfirm={handleConfirm}
              onReject={handleReject}
            />
          ))}
        </ul>
      )}
    </Tile>
  );
}
