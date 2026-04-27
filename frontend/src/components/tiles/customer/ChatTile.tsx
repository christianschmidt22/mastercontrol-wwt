import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type FormEvent,
} from 'react';
import { Send, Square, Copy, BookmarkPlus } from 'lucide-react';
import { Tile } from '../Tile';
import { useStreamChat, type UseStreamChat } from '../../../api/useStreamChat';
import { useCreateNote } from '../../../api/useNotes';
import type { NoteCreate } from '../../../types';

/**
 * ChatTile — composer + thread feed for the current org.
 *
 * Uses `useStreamChat(orgId, threadId)` for all stateful streaming logic.
 * Streaming caret is a 1px vertical block that blinks via the .stream-caret CSS class
 * defined in index.css (blink suppressed under prefers-reduced-motion).
 *
 * Failure state: partial text stays, vermilion top-border, error message + Retry button.
 * Error messages are classified: auth → Settings link, network → connection hint,
 * upstream → Anthropic error details.
 *
 * Hover toolbar: Copy (all messages) + Save as note (assistant only).
 * Toolbar uses opacity 0/1 on row hover; transition suppressed under prefers-reduced-motion.
 */

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

type ErrorKind = 'auth' | 'network' | 'upstream';

function classifyError(msg: string): { kind: ErrorKind; text: string } {
  const lower = msg.toLowerCase();
  if (
    lower.includes('api key') ||
    lower.includes('not configured') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('403')
  ) {
    return { kind: 'auth', text: 'API key not configured' };
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('econnrefused') ||
    lower.includes('connection refused')
  ) {
    return { kind: 'network', text: 'Network error — check your connection' };
  }
  return { kind: 'upstream', text: `Anthropic returned an error: ${msg}` };
}

// ---------------------------------------------------------------------------
// Narrow injectable type for useCreateNote (tests supply a simple stub)
// ---------------------------------------------------------------------------

type UseCreateNoteFn = () => {
  // onSuccess receives the created Note but callers may ignore it — use
  // a rest signature so both the real hook and simple test stubs satisfy this type.
  mutate: (
    variables: NoteCreate,
    options?: { onSuccess?: (...args: unknown[]) => void },
  ) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChatTileProps {
  orgId: number;
  orgName: string;
  threadId?: number;
  /** Dependency injection override for tests — replaces useStreamChat. */
  _useStreamChat?: (orgId: number, threadId?: number) => UseStreamChat;
  /** Dependency injection override for tests — replaces useCreateNote. */
  _useCreateNote?: UseCreateNoteFn;
}

export function ChatTile({
  orgId,
  orgName,
  threadId,
  _useStreamChat,
  _useCreateNote,
}: ChatTileProps) {
  const useStreamChatFn = _useStreamChat ?? useStreamChat;
  // The real useCreateNote returns a richer type; the narrow UseCreateNoteFn captures only
  // what this component needs (mutate). The cast is intentional — see type definition above.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const useCreateNoteFn: UseCreateNoteFn = (_useCreateNote ?? useCreateNote) as UseCreateNoteFn;

  const { messages, stream, send, stop, retry } = useStreamChatFn(orgId, threadId);
  const createNote = useCreateNoteFn();

  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Hover tracking for message rows
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Per-message toast state — key is `${msgKey}-saved` or `${msgKey}-copied`
  const [toasts, setToasts] = useState<Record<string, boolean>>({});

  // Single live-region string for a11y announcements (Saved / Copied)
  const [liveMsg, setLiveMsg] = useState('');

  // Auto-scroll feed to bottom when messages or stream partial changes
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, stream.partial]);

  // ---------------------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------------------

  const flashToast = useCallback((key: string, announcement: string) => {
    setToasts((prev) => ({ ...prev, [key]: true }));
    setLiveMsg(announcement);
    setTimeout(() => {
      setToasts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setLiveMsg('');
    }, 2000);
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-resize textarea: onInput resets to auto then caps at 8 rows
  // ---------------------------------------------------------------------------

  const handleTextareaInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      ta.style.height = 'auto';
      const lineH = 24 * 1.4; // 24px font-size × 1.4 line-height ≈ 33.6px/row
      const maxH = lineH * 8;
      ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`;
      ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Composer submit / keyboard
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed || stream.streaming) return;
      setDraft('');
      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.overflowY = 'hidden';
      }
      send(trimmed);
    },
    [draft, stream.streaming, send],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // ---------------------------------------------------------------------------
  // Message actions
  // ---------------------------------------------------------------------------

  const handleSaveAsNote = useCallback(
    (content: string, toastKey: string) => {
      createNote.mutate(
        { organization_id: orgId, content, role: 'user', confirmed: true },
        { onSuccess: () => { flashToast(toastKey, 'Saved'); } },
      );
    },
    [createNote, orgId, flashToast],
  );

  const handleCopy = useCallback(
    async (content: string, toastKey: string) => {
      await navigator.clipboard.writeText(content);
      flashToast(toastKey, 'Copied');
    },
    [flashToast],
  );

  // ---------------------------------------------------------------------------
  // Error classification
  // ---------------------------------------------------------------------------

  const errorInfo = stream.failed !== null ? classifyError(stream.failed) : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Tile title={`${orgName} Agent`}>
      {/* Screen-reader live region for toast announcements */}
      <span
        role="status"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        {liveMsg}
      </span>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 0,
        }}
      >
        {/* Stream failure banner */}
        {stream.failed !== null && errorInfo !== null && (
          <div
            role="alert"
            style={{
              borderTop: '2px solid var(--accent)',
              padding: '8px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--ink-1)', flex: 1 }}>
              {errorInfo.kind === 'auth' ? (
                <>
                  API key not configured —{' '}
                  <a
                    href="/settings"
                    style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                  >
                    go to Settings
                  </a>
                </>
              ) : errorInfo.kind === 'network' ? (
                'Network error — check your connection'
              ) : (
                errorInfo.text
              )}
            </span>
            <button
              type="button"
              onClick={retry}
              style={{
                background: 'transparent',
                border: '1px solid var(--rule)',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 12,
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Notes / message feed */}
        <div
          ref={feedRef}
          aria-live="polite"
          aria-label="Chat history"
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            paddingRight: 4,
            minHeight: 0,
          }}
        >
          {messages.map((msg, idx) => {
            const msgKey = String(msg.id ?? `msg-${idx}`);
            const savedKey = `${msgKey}-saved`;
            const copiedKey = `${msgKey}-copied`;
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={msgKey}
                data-role={msg.role}
                onMouseEnter={() => { setHoveredIdx(idx); }}
                onMouseLeave={() => { setHoveredIdx(null); }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr',
                  gap: 14,
                  alignItems: 'baseline',
                }}
              >
                {/* Timestamp column (empty for chat messages, used for alignment) */}
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--ink-3)',
                    fontVariantNumeric: 'tabular-nums',
                    paddingTop: 2,
                  }}
                  aria-hidden="true"
                />

                {/* Content + hover toolbar */}
                <div style={{ position: 'relative' }}>
                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: msg.role === 'assistant' ? 'var(--ink-2)' : 'var(--ink-1)',
                      margin: 0,
                      textWrap: 'pretty',
                      // Reserve space so toolbar doesn't overlap last line
                      paddingRight: msg.role === 'assistant' ? 56 : 32,
                    }}
                  >
                    {msg.content}
                  </p>

                  {/* Hover toolbar — opacity-only, always in accessibility tree */}
                  <div
                    className="msg-toolbar"
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      display: 'flex',
                      gap: 4,
                      alignItems: 'center',
                      opacity: isHovered ? 1 : 0,
                      transition: 'opacity 150ms var(--ease)',
                    }}
                  >
                    {/* Copy button — all messages */}
                    {toasts[copiedKey] ? (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--ink-3)',
                          fontFamily: 'var(--mono)',
                          lineHeight: '22px',
                        }}
                      >
                        Copied
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label="Copy message"
                        onClick={() => { void handleCopy(msg.content, copiedKey); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 22,
                          height: 22,
                          background: 'transparent',
                          border: '1px solid var(--rule)',
                          borderRadius: 4,
                          cursor: 'pointer',
                          color: 'var(--ink-3)',
                          padding: 0,
                        }}
                      >
                        <Copy size={11} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    )}

                    {/* Save as note — assistant messages only */}
                    {msg.role === 'assistant' && (
                      toasts[savedKey] ? (
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--ink-3)',
                            fontFamily: 'var(--mono)',
                            lineHeight: '22px',
                          }}
                        >
                          Saved
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label="Save as note"
                          onClick={() => { handleSaveAsNote(msg.content, savedKey); }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 22,
                            height: 22,
                            background: 'transparent',
                            border: '1px solid var(--rule)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            color: 'var(--ink-3)',
                            padding: 0,
                          }}
                        >
                          <BookmarkPlus size={11} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Streaming partial text + caret */}
          {stream.streaming && stream.partial && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                gap: 14,
                alignItems: 'baseline',
              }}
            >
              <time style={{ fontSize: 10, color: 'var(--ink-3)' }}>Now</time>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'var(--ink-2)',
                  margin: 0,
                }}
              >
                {stream.partial}
                <span
                  className="stream-caret"
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 1,
                    height: '1.05em',
                    background: 'var(--accent)',
                    marginLeft: 1,
                    transform: 'translateY(3px)',
                    animation: 'blink 1s steps(2, start) infinite',
                  }}
                />
              </p>
            </div>
          )}

          {/* Partial text preserved after user abort (no failure banner) */}
          {!stream.streaming && stream.failed === null && stream.partial && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                gap: 14,
                alignItems: 'baseline',
              }}
            >
              <span style={{ fontSize: 10, color: 'var(--ink-3)' }} aria-hidden="true" />
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'var(--ink-2)',
                  margin: 0,
                }}
              >
                {stream.partial}
              </p>
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          style={{
            marginTop: 'auto',
            paddingTop: 14,
            borderTop: '1px solid var(--rule)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <label htmlFor={`chat-composer-${orgId}`} className="sr-only">
            Message the {orgName} agent
          </label>
          <textarea
            ref={textareaRef}
            id={`chat-composer-${orgId}`}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); }}
            onKeyDown={handleKeyDown}
            onInput={handleTextareaInput}
            placeholder={`Ask the ${orgName} agent…`}
            rows={1}
            disabled={stream.streaming}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              fontFamily: 'var(--body)',
              fontWeight: 300,
              fontSize: 24,
              lineHeight: 1.4,
              color: 'var(--ink-1)',
              resize: 'none',
              padding: 0,
              overflowY: 'hidden',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--ink-3)',
              }}
            >
              <kbd
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--rule)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  color: 'var(--ink-2)',
                }}
              >
                Ctrl + Enter
              </kbd>{' '}
              to send
            </span>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {stream.streaming && (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop streaming"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'transparent',
                    border: '1px solid var(--rule)',
                    borderRadius: 4,
                    padding: '5px 10px',
                    fontSize: 12,
                    color: 'var(--ink-2)',
                    cursor: 'pointer',
                    fontFamily: 'var(--body)',
                  }}
                >
                  <Square size={12} strokeWidth={1.5} aria-hidden="true" />
                  Stop
                </button>
              )}
              <button
                type="submit"
                disabled={stream.streaming || !draft.trim()}
                aria-label={stream.streaming ? 'Streaming…' : 'Send message'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  background: draft.trim() && !stream.streaming ? 'var(--bg-2)' : 'transparent',
                  border: '1px solid var(--rule)',
                  borderRadius: 6,
                  cursor: draft.trim() && !stream.streaming ? 'pointer' : 'default',
                  color: draft.trim() && !stream.streaming ? 'var(--ink-1)' : 'var(--ink-3)',
                  transition: 'background-color 150ms var(--ease), color 150ms var(--ease)',
                }}
              >
                {stream.streaming ? (
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 14,
                      height: 14,
                      border: '1.5px solid var(--ink-3)',
                      borderTopColor: 'var(--accent)',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                ) : (
                  <Send size={14} strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes blink { to { background: transparent; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border-width: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .msg-toolbar { transition: none !important; }
          .stream-caret { animation: none !important; }
        }
      `}</style>
    </Tile>
  );
}
