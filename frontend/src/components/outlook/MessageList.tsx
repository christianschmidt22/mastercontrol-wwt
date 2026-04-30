/**
 * MessageList — reusable list of Outlook messages.
 *
 * Shows subject (truncated), from name, and relative sent date.
 * Body content is not displayed (preview only in Phase 3).
 */

import type { OutlookMessage } from '../../types/outlook';

interface MessageListProps {
  messages: OutlookMessage[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
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

function MessageRow({ message }: { message: OutlookMessage }) {
  const fromLabel = message.from_name || message.from_email || 'Unknown';
  const subject = message.subject || '(no subject)';
  const relDate = formatRelative(message.sent_at);

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 8,
        alignItems: 'start',
        padding: '6px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--ink-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={subject}
        >
          {subject}
        </p>
        <p
          style={{
            margin: '2px 0 0',
            fontSize: 11,
            color: 'var(--ink-3)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fromLabel}
          {message.has_attachments && (
            <span
              aria-label="Has attachments"
              title="Has attachments"
              style={{ marginLeft: 4 }}
            >
              📎
            </span>
          )}
        </p>
      </div>
      <time
        dateTime={message.sent_at ?? undefined}
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          paddingTop: 2,
          flexShrink: 0,
        }}
      >
        {relDate}
      </time>
    </li>
  );
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        No messages found.
      </p>
    );
  }

  return (
    <ul
      role="list"
      aria-label="Outlook messages"
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {messages.map((msg) => (
        <MessageRow key={msg.internet_message_id} message={msg} />
      ))}
    </ul>
  );
}
