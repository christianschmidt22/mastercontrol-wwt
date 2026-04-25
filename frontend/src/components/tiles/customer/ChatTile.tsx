import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type FormEvent,
} from 'react';
import { Send, Square } from 'lucide-react';
import { Tile } from '../Tile';
import { useStreamChat } from '../../../api/useStreamChat';

/**
 * ChatTile — composer + thread feed for the current org.
 *
 * Uses `useStreamChat(orgId, threadId)` for all stateful streaming logic.
 * Streaming caret is a 1px vertical block that blinks via the .stream-caret CSS class
 * defined in index.css (blink suppressed under prefers-reduced-motion).
 *
 * Failure state: partial text stays, vermilion top-border, error message + Retry button.
 */

interface ChatTileProps {
  orgId: number;
  orgName: string;
  threadId?: number;
}

export function ChatTile({ orgId, orgName, threadId }: ChatTileProps) {
  const { messages, stream, send, stop, retry } = useStreamChat(orgId, threadId);

  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll feed to bottom when new messages arrive or stream updates
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, stream.partial]);

  // Auto-grow textarea up to 12 lines
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = 24 * 1.4; // 24px font-size × 1.4 line-height
    const maxHeight = lineHeight * 12;
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
    ta.style.overflowY = ta.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [draft]);

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed || stream.streaming) return;
      setDraft('');
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

  return (
    <Tile title={`${orgName} Agent`}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 0,
        }}
      >
        {/* Stream failure banner */}
        {stream.failed !== null && (
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
              Stream interrupted — try again
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
          {messages.map((msg, idx) => (
            <div
              key={msg.id ?? `msg-${idx}`}
              data-role={msg.role}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                gap: 14,
                alignItems: 'baseline',
              }}
            >
              {/* Spacer column — persisted messages have no client-side timestamp */}
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--ink-3)',
                  fontVariantNumeric: 'tabular-nums',
                  paddingTop: 2,
                }}
                aria-hidden="true"
              />
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: msg.role === 'assistant' ? 'var(--ink-2)' : 'var(--ink-1)',
                  margin: 0,
                  textWrap: 'pretty',
                }}
              >
                {msg.content}
              </p>
            </div>
          ))}

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
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
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
                &#8984; Enter
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
      `}</style>
    </Tile>
  );
}
