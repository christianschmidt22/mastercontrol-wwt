import { useState } from 'react';
import type { AgentAuditEntry } from '../../api/useAgentThreads';
import { useAgentAudit } from '../../api/useAgentThreads';
import { useOrganizations } from '../../api/useOrganizations';
import { request } from '../../api/http';
import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types — mirrors backend contract; kept here until a shared types file lands
// ---------------------------------------------------------------------------

interface AgentThread {
  id: number;
  organization_id: number;
  title: string | null;
  started_at: string;
  last_message_at: string;
}

// ---------------------------------------------------------------------------
// Hook — fetch all threads (no org filter)
// ---------------------------------------------------------------------------

function useAllThreads(limit: number) {
  return useQuery({
    queryKey: ['agent_threads_all', { limit }],
    queryFn: () =>
      request<AgentThread[]>('GET', `/api/agents/threads?limit=${limit}`),
  });
}

// ---------------------------------------------------------------------------
// Audit row
// ---------------------------------------------------------------------------

function statusColor(status: string): string {
  if (status === 'ok') return 'var(--ink-1)';
  // 'rejected' or 'error' → vermilion (transient signal per design)
  return 'var(--accent)';
}

function AuditRow({ entry }: { entry: AgentAuditEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li
      style={{
        borderBottom: '1px solid var(--rule)',
        padding: '10px 0',
        fontFamily: 'var(--body)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Tool name */}
        <code
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: 'var(--ink-1)',
            background: 'var(--bg-2)',
            border: '1px solid var(--rule)',
            borderRadius: 4,
            padding: '2px 6px',
          }}
        >
          {entry.tool}
        </code>

        {/* Status pill */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: statusColor(entry.ok ? 'ok' : 'error'),
            background:
              entry.ok ? 'var(--bg-2)' : 'color-mix(in srgb, var(--accent) 12%, var(--bg))',
            border: `1px solid ${entry.ok ? 'var(--rule)' : 'color-mix(in srgb, var(--accent) 35%, var(--bg))'}`,
            borderRadius: 4,
            padding: '2px 7px',
            fontFamily: 'var(--body)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {entry.ok ? 'ok' : entry.message ? 'error' : 'rejected'}
        </span>

        {/* Timestamp */}
        <span
          className="tnum"
          style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}
        >
          {new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(entry.created_at))}
        </span>

        {/* Expand toggle */}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            fontFamily: 'var(--body)',
            color: 'var(--ink-2)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
          }}
        >
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--ink-3)',
                fontFamily: 'var(--body)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 6,
              }}
            >
              Input
            </p>
            <pre
              className="mono"
              style={{
                fontSize: 12,
                color: 'var(--ink-1)',
                background: 'var(--bg-2)',
                border: '1px solid var(--rule)',
                borderRadius: 4,
                padding: '8px 10px',
                overflowX: 'auto',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {JSON.stringify(entry.input, null, 2)}
            </pre>
          </div>
          {entry.message && (
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--body)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                }}
              >
                Output / error
              </p>
              <pre
                className="mono"
                style={{
                  fontSize: 12,
                  color: entry.ok ? 'var(--ink-1)' : 'var(--accent)',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--rule)',
                  borderRadius: 4,
                  padding: '8px 10px',
                  overflowX: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {entry.message}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Thread row
// ---------------------------------------------------------------------------

interface ThreadRowProps {
  thread: AgentThread;
  orgName: string;
}

function ThreadRow({ thread, orgName }: ThreadRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: auditEntries, isLoading } = useAgentAudit(
    expanded ? thread.id : undefined,
  );

  const title = thread.title ?? `Thread #${thread.id}`;

  return (
    <li style={{ borderBottom: '1px solid var(--rule)' }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          alignItems: 'center',
          gap: 16,
          padding: '14px 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--body)',
        }}
      >
        {/* Title + org */}
        <div style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--ink-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--ink-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {orgName}
          </span>
        </div>

        {/* Started at */}
        <span
          className="tnum"
          style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}
        >
          {new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
          }).format(new Date(thread.started_at))}
        </span>

        {/* Last message at */}
        <span
          className="tnum"
          style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}
        >
          {new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(thread.last_message_at))}
        </span>
      </button>

      {/* Expanded audit timeline */}
      {expanded && (
        <div
          style={{
            paddingBottom: 16,
            paddingLeft: 0,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}
          >
            Tool call audit log
          </p>

          {isLoading && (
            <p
              role="status"
              style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}
            >
              Loading…
            </p>
          )}

          {!isLoading && (!auditEntries || auditEntries.length === 0) && (
            <p
              style={{
                fontSize: 13,
                color: 'var(--ink-3)',
                fontFamily: 'var(--body)',
                fontStyle: 'italic',
              }}
            >
              No tool calls in this thread.
            </p>
          )}

          {auditEntries && auditEntries.length > 0 && (
            <ul
              role="list"
              aria-label={`Audit log for ${title}`}
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {auditEntries.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tab panel
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export function ThreadsTab() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data: threads, isLoading, isError } = useAllThreads(limit + 1);
  const { data: orgs } = useOrganizations();

  const orgMap = new Map<number, string>(
    (orgs ?? []).map((o) => [o.id, o.name]),
  );

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading threads"
        style={{ padding: '48px 0', color: 'var(--ink-3)', fontFamily: 'var(--body)', fontSize: 14 }}
      >
        Loading threads…
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        style={{ padding: '48px 0', color: 'var(--accent)', fontFamily: 'var(--body)', fontSize: 14 }}
      >
        Failed to load threads.
      </div>
    );
  }

  const hasMore = (threads?.length ?? 0) > limit;
  const visible = threads?.slice(0, limit) ?? [];

  if (visible.length === 0) {
    return (
      <div
        style={{
          border: '1px dashed var(--rule)',
          borderRadius: 8,
          padding: '48px 24px',
          textAlign: 'center',
          color: 'var(--ink-2)',
          fontFamily: 'var(--body)',
          fontSize: 14,
        }}
      >
        No agent threads yet — start a conversation on any org to see threads here.
      </div>
    );
  }

  return (
    <div>
      {/* Column headers */}
      <div
        aria-hidden="true"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: 16,
          padding: '0 0 8px',
          borderBottom: '1px solid var(--rule)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--ink-3)',
          fontFamily: 'var(--body)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span>Thread / Org</span>
        <span>Started</span>
        <span>Last message</span>
      </div>

      <ul
        role="list"
        aria-label="Recent agent threads"
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {visible.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            orgName={orgMap.get(thread.organization_id) ?? `Org #${thread.organization_id}`}
          />
        ))}
      </ul>

      {hasMore && (
        <div style={{ paddingTop: 20, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
            style={{
              padding: '8px 20px',
              fontFamily: 'var(--body)',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--ink-1)',
              background: 'var(--bg-2)',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
