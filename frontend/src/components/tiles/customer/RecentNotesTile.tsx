import { useState, useCallback, useId, type FormEvent } from 'react';
import { Check, X, Plus } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Note, NoteCreate } from '../../../types';
import {
  useNotes as useNotesReal,
  useCreateNote as useCreateNoteReal,
  useConfirmInsight as useConfirmInsightReal,
  useRejectInsight as useRejectInsightReal,
} from '../../../api/useNotes';

// ---------------------------------------------------------------------------
// Hook interfaces — narrower than UseMutationResult for inject-ability
// ---------------------------------------------------------------------------

interface UseNotesResult {
  data: Note[] | undefined;
  isLoading: boolean;
}

interface UseCreateNoteResult {
  mutate: (data: NoteCreate) => void;
  isPending: boolean;
}

function useNotesStub(_orgId: number, _options?: { includeUnconfirmed?: boolean }): UseNotesResult {
  return { data: undefined, isLoading: false };
}

function useCreateNoteStub(): UseCreateNoteResult {
  return { mutate: () => {}, isPending: false };
}

interface RecentNotesTileProps {
  orgId: number;
  _useNotes?: (orgId: number, options?: { includeUnconfirmed?: boolean }) => UseNotesResult;
  _useConfirmInsight?: () => { mutate: (args: { id: number; orgId: number }) => void };
  _useRejectInsight?: () => { mutate: (args: { id: number; orgId: number }) => void };
  _useCreateNote?: () => UseCreateNoteResult;
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
            }
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
 * Inline "+ Add note" form in the tile header (or empty-state action).
 */
export function RecentNotesTile({
  orgId,
  _useNotes,
  _useConfirmInsight,
  _useRejectInsight,
  _useCreateNote,
}: RecentNotesTileProps) {
  const useNotes = _useNotes ?? useNotesReal;
  const useCreateNote = _useCreateNote ?? useCreateNoteReal;
  const { data: notes, isLoading } = useNotes(orgId, { includeUnconfirmed: true });

  // Confirm/reject — real hooks take { id, orgId }; injected test hooks take just (id)
  const { mutate: confirmInsightRaw } = (_useConfirmInsight ?? useConfirmInsightReal)();
  const { mutate: rejectInsightRaw } = (_useRejectInsight ?? useRejectInsightReal)();
  const { mutate: createNote, isPending } = useCreateNote();

  const handleConfirm = useCallback(
    (id: number) => confirmInsightRaw({ id, orgId }),
    [confirmInsightRaw, orgId],
  );
  const handleReject = useCallback(
    (id: number) => rejectInsightRaw({ id, orgId }),
    [rejectInsightRaw, orgId],
  );

  const [adding, setAdding] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  const formId = useId();
  const textareaId = `${formId}-content`;

  const handleCancelNote = useCallback(() => {
    setNoteContent('');
    setAdding(false);
  }, []);

  const handleAddNote = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = noteContent.trim();
      if (!trimmed) return;
      createNote({
        organization_id: orgId,
        content: trimmed,
        role: 'user',
      });
      setNoteContent('');
      setAdding(false);
    },
    [noteContent, orgId, createNote],
  );

  const noteList = notes ?? [];
  const canSave = noteContent.trim().length > 0;

  return (
    <Tile
      title="Recent Notes"
      count={isLoading ? '…' : noteList.length || undefined}
      titleAction={
        !adding && noteList.length > 0 ? (
          <button
            type="button"
            aria-label="Add note"
            onClick={() => setAdding(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: 'none',
              padding: '2px 4px',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
            }}
          >
            <Plus size={11} strokeWidth={1.5} aria-hidden="true" />
            Add note
          </button>
        ) : undefined
      }
    >
      {/* Inline add form — shown above the list whether list is empty or not */}
      {adding && (
        <form
          onSubmit={handleAddNote}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: noteList.length > 0 ? 14 : 0,
          }}
        >
          {/* Visually hidden label for a11y */}
          <label
            htmlFor={textareaId}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
            }}
          >
            Note content
          </label>
          <textarea
            id={textareaId}
            rows={4}
            autoFocus
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="What happened? What's the context?"
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 4,
              padding: '6px 8px',
              fontSize: 13,
              background: 'transparent',
              color: 'var(--ink-1)',
              fontFamily: 'var(--body)',
              resize: 'vertical',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleCancelNote}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: '1px solid var(--rule)',
                borderRadius: 4,
                background: 'transparent',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave || isPending}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: 'none',
                borderRadius: 4,
                background: 'var(--accent)',
                color: '#fff',
                cursor: canSave && !isPending ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--body)',
                opacity: canSave ? 1 : 0.5,
              }}
            >
              Save Note
            </button>
          </div>
        </form>
      )}

      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && noteList.length === 0 && !adding && (
        <TileEmptyState
          copy="Take your first note. The agent will see anything you save here."
          actionLabel="Add note"
          onAction={() => setAdding(true)}
          ariaLive
        />
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
