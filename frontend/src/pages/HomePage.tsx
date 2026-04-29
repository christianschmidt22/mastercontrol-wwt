import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw } from 'lucide-react';
import { Tile } from '../components/tiles/Tile';
import { NoteApprovalsTile } from '../components/notes/NoteApprovalsTile';
import { TodayAgendaTile } from '../components/tiles/home/TodayAgendaTile';
import { TaskEditDialog } from '../components/tasks/TaskEditDialog';
import { useTasks, useCompleteTask } from '../api/useTasks';
import { useOrganizations } from '../api/useOrganizations';
import { noteKeys } from '../api/useNotes';
import { BacklogTile } from '../components/backlog/BacklogTile';
import { useQueries } from '@tanstack/react-query';
import { request } from '../api/http';
import type { Task, Note, Organization } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function formatDue(dueDate: string | null): string {
  if (!dueDate) return '';
  const d = new Date(dueDate + 'T00:00:00');
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(d);
}

function formatNoteTimestamp(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(',', '');
}

// ---------------------------------------------------------------------------
// Inline error state reused in tiles
// ---------------------------------------------------------------------------

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--ink-2)',
        fontFamily: 'var(--body)',
        padding: '10px 0',
      }}
    >
      {message}
      <button
        type="button"
        onClick={onRetry}
        style={{
          fontFamily: 'var(--body)',
          fontSize: 12,
          background: 'transparent',
          border: '1px solid var(--rule)',
          borderRadius: 4,
          padding: '2px 8px',
          cursor: 'pointer',
          color: 'var(--ink-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <RefreshCw size={10} strokeWidth={1.5} aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        border: '1px dashed var(--rule)',
        borderRadius: 6,
        padding: '16px',
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--ink-2)',
        fontFamily: 'var(--body)',
      }}
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget 1 — Today's tasks
// ---------------------------------------------------------------------------

interface TodayTasksWidgetProps {
  orgMap: Map<number, Organization>;
}

function TodayTasksWidget({ orgMap }: TodayTasksWidgetProps) {
  // No status / due-date filter on the request — pull everything and filter
  // client-side to open OR snoozed, so the home tile shows the full active
  // backlog (not just things due today).
  const tasksQuery = useTasks();
  const { mutate: completeTask } = useCompleteTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const tasks: Task[] = (tasksQuery.data ?? [])
    .filter((t) => t.status === 'open' || t.status === 'snoozed')
    .sort((a, b) => {
      // Descending by due_date — latest due first, undated last.
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return b.due_date.localeCompare(a.due_date);
    });

  const handleComplete = useCallback(
    (id: number) => {
      completeTask(id);
    },
    [completeTask],
  );

  return (
    <Tile title="Tasks" count={tasksQuery.isLoading ? '…' : tasks.length || undefined}>
      {tasksQuery.isError && (
        <TileError
          message="Couldn't load tasks"
          onRetry={() => void tasksQuery.refetch()}
        />
      )}
      {tasksQuery.isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}>
          Loading…
        </p>
      )}
      {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 && (
        <EmptyState text="No open tasks." />
      )}
      {tasks.length > 0 && (
        <ul
          role="list"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}
        >
          {tasks.map((task) => {
            const overdue = isOverdue(task.due_date);
            const checkId = `home-task-${task.id}`;
            const orgName =
              task.organization_id !== null
                ? orgMap.get(task.organization_id)?.name
                : undefined;
            return (
              <li
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '6px 0',
                  borderBottom: '1px dotted var(--rule)',
                }}
              >
                <input
                  id={checkId}
                  type="checkbox"
                  aria-label={`Mark complete: ${task.title}`}
                  checked={false}
                  onChange={() => handleComplete(task.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 14,
                    height: 14,
                    flexShrink: 0,
                    cursor: 'pointer',
                    accentColor: 'var(--ink-3)',
                    transform: 'translateY(2px)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setEditingTask(task)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--body)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      color: 'var(--ink-1)',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.title}
                  </span>
                  {orgName && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        display: 'block',
                      }}
                    >
                      {orgName}
                    </span>
                  )}
                </button>
                {task.due_date && (
                  <time
                    dateTime={task.due_date}
                    style={{
                      fontSize: 12,
                      color: overdue ? 'var(--accent)' : 'var(--ink-3)',
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {formatDue(task.due_date)}
                  </time>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editingTask && (
        <TaskEditDialog task={editingTask} onClose={() => setEditingTask(null)} />
      )}
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Widget 2 — Recent notes (cross-org)
// ---------------------------------------------------------------------------

interface RecentNotesWidgetProps {
  orgs: Organization[];
  orgMap: Map<number, Organization>;
}

interface NoteWithOrg extends Note {
  orgName: string;
  orgType: 'customer' | 'oem';
}

function RecentNotesWidget({ orgs }: RecentNotesWidgetProps) {
  const navigate = useNavigate();

  const noteQueries = useQueries({
    queries: orgs.map((org) => ({
      queryKey: noteKeys.list(org.id, false),
      queryFn: () =>
        request<Note[]>('GET', `/api/organizations/${org.id}/notes`),
      enabled: org.id > 0,
    })),
  });

  const isLoading = noteQueries.some((q) => q.isLoading);
  const isError = !isLoading && noteQueries.every((q) => q.isError);

  const allNotes: NoteWithOrg[] = noteQueries
    .flatMap((q, i) => {
      const org = orgs[i];
      if (!org || !q.data) return [];
      return q.data
        .filter((n) => n.role === 'user' || n.role === 'imported')
        .map((n): NoteWithOrg => ({
          ...n,
          orgName: org.name,
          orgType: org.type,
        }));
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const handleNoteClick = (note: NoteWithOrg) => {
    if (note.orgType === 'customer') {
      navigate(`/customers/${note.organization_id}`);
    } else {
      navigate(`/oem/${note.organization_id}`);
    }
  };

  const handleRetry = () => {
    noteQueries.forEach((q) => void q.refetch());
  };

  return (
    <Tile title="Recent Notes" count={isLoading ? '…' : allNotes.length || undefined}>
      {isError && (
        <TileError message="Couldn't load notes" onRetry={handleRetry} />
      )}
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}>
          Loading…
        </p>
      )}
      {!isLoading && !isError && allNotes.length === 0 && (
        <EmptyState text="No notes yet." />
      )}
      {allNotes.length > 0 && (
        <ul
          role="list"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {allNotes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => handleNoteClick(note)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '4px 10px',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 0',
                  cursor: 'pointer',
                  borderBottom: '1px dotted var(--rule)',
                }}
                aria-label={`Go to ${note.orgName}`}
              >
                <time
                  dateTime={note.created_at}
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'var(--body)',
                    gridRow: '1 / 3',
                    alignSelf: 'start',
                    paddingTop: 2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatNoteTimestamp(note.created_at)}
                </time>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--ink-1)',
                    fontFamily: 'var(--body)',
                    margin: 0,
                    lineHeight: 1.45,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {note.content}
                </p>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    fontFamily: 'var(--body)',
                  }}
                >
                  {note.orgName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// Widget 4 — Today's reports (placeholder)
// ---------------------------------------------------------------------------

function TodaysReportsWidget() {
  return (
    <Tile title="Today's Reports">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '16px 0',
          textAlign: 'center',
        }}
      >
        <Clock
          size={20}
          strokeWidth={1.5}
          aria-hidden="true"
          style={{ color: 'var(--ink-3)' }}
        />
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
            margin: 0,
            maxWidth: '28ch',
            lineHeight: 1.6,
          }}
        >
          Reports run on schedule starting Phase&nbsp;2.
        </p>
      </div>
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

const longDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function HomePage() {
  const now = new Date();
  const dateStr = longDate.format(now);

  const customersQuery = useOrganizations('customer');
  const oemsQuery = useOrganizations('oem');

  const allOrgs: Organization[] = [
    ...(customersQuery.data ?? []),
    ...(oemsQuery.data ?? []),
  ];

  const orgMap = new Map<number, Organization>(allOrgs.map((o) => [o.id, o]));

  return (
    <div>
      {/* Page header */}
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontFamily: 'var(--body)',
          marginBottom: 8,
        }}
      >
        HOME
      </p>
      <h1
        style={{
          fontFamily: 'var(--display)',
          fontSize: 56,
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          marginLeft: -3,
          marginBottom: 6,
          textWrap: 'balance',
        }}
      >
        Today.
      </h1>
      <p
        style={{
          fontSize: 16,
          color: 'var(--ink-2)',
          fontFamily: 'var(--body)',
          marginBottom: 28,
        }}
      >
        {dateStr}
      </p>

      {/* 2-column widget grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: 'auto auto auto',
          gap: 16,
        }}
        // Single-column below 900px via inline media query workaround — handled by Tailwind class below
        className="home-grid"
      >
        {/* Top-left: Today's tasks — slightly taller */}
        <div style={{ gridColumn: 1, gridRow: 1 }}>
          <TodayTasksWidget orgMap={orgMap} />
        </div>

        {/* Top-right: Recent notes */}
        <div style={{ gridColumn: 2, gridRow: 1 }}>
          <RecentNotesWidget orgs={allOrgs} orgMap={orgMap} />
        </div>

        {/* Bottom-left: MasterControl backlog */}
        <div style={{ gridColumn: 1, gridRow: 2 }}>
          <BacklogTile />
        </div>

        {/* Bottom-right: Reports placeholder */}
        <div style={{ gridColumn: 2, gridRow: 2 }}>
          <TodaysReportsWidget />
        </div>

        {/* Row 3: Today's agenda — full width */}
        <div style={{ gridColumn: '1 / -1', gridRow: 3 }}>
          <TodayAgendaTile />
        </div>

        <div style={{ gridColumn: '1 / -1', gridRow: 4, minHeight: 280 }}>
          <NoteApprovalsTile />
        </div>
      </div>
    </div>
  );
}
