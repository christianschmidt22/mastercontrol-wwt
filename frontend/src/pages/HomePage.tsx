import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Clock, GripVertical, RefreshCw } from 'lucide-react';
import { Tile } from '../components/tiles/Tile';
import { NoteApprovalsTile } from '../components/notes/NoteApprovalsTile';
import { TodayAgendaTile } from '../components/tiles/home/TodayAgendaTile';
import { TaskEditDialog } from '../components/tasks/TaskEditDialog';
import { PageHeader } from '../components/layout/PageHeader';
import { useTasks, useCompleteTask } from '../api/useTasks';
import { useOrganizations } from '../api/useOrganizations';
import { BacklogTile } from '../components/backlog/BacklogTile';
import { useReports } from '../api/useReports';
import { useReportRuns } from '../api/useReportRuns';
import { ReportPreview } from '../components/overlays/ReportPreview';
import {
  getDailyPonderingResponse,
  PONDERING_PROMPT,
} from '../data/ponderingResponses';
import type { Task, Organization } from '../types';

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
  const [taskOrder, setTaskOrder] = useState<number[]>(() => readHomeTaskOrder());
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);

  const defaultSortedTasks = useMemo(() => (tasksQuery.data ?? [])
    .filter((t) => t.kind !== 'question' && (t.status === 'open' || t.status === 'snoozed'))
    .sort((a, b) => {
      // Descending by due_date — latest due first, undated last.
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return b.due_date.localeCompare(a.due_date);
    }), [tasksQuery.data]);

  const tasks = useMemo(() => {
    const byId = new Map(defaultSortedTasks.map((task) => [task.id, task]));
    const ordered = taskOrder.flatMap((id) => {
      const task = byId.get(id);
      if (!task) return [];
      byId.delete(id);
      return [task];
    });
    return [...ordered, ...defaultSortedTasks.filter((task) => byId.has(task.id))];
  }, [defaultSortedTasks, taskOrder]);

  useEffect(() => {
    setTaskOrder((current) => {
      const activeIds = new Set(defaultSortedTasks.map((task) => task.id));
      const next = current.filter((id) => activeIds.has(id));
      if (next.length !== current.length) writeHomeTaskOrder(next);
      return next.length === current.length ? current : next;
    });
  }, [defaultSortedTasks]);

  const persistOrder = useCallback((orderedTasks: Task[]) => {
    const ids = orderedTasks.map((task) => task.id);
    setTaskOrder(ids);
    writeHomeTaskOrder(ids);
  }, []);

  const moveTask = useCallback((taskId: number, direction: -1 | 1) => {
    const from = tasks.findIndex((task) => task.id === taskId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= tasks.length) return;
    const next = [...tasks];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    persistOrder(next);
  }, [persistOrder, tasks]);

  const moveTaskToDropTarget = useCallback((draggedId: number, targetId: number, placeAfter: boolean) => {
    if (draggedId === targetId) return;
    const dragged = tasks.find((task) => task.id === draggedId);
    if (!dragged) return;
    const withoutDragged = tasks.filter((task) => task.id !== draggedId);
    const targetIndex = withoutDragged.findIndex((task) => task.id === targetId);
    if (targetIndex < 0) return;
    const next = [...withoutDragged];
    next.splice(placeAfter ? targetIndex + 1 : targetIndex, 0, dragged);
    persistOrder(next);
  }, [persistOrder, tasks]);

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
          {tasks.map((task, index) => {
            const overdue = isOverdue(task.due_date);
            const checkId = `home-task-${task.id}`;
            const orgName =
              task.organization_id !== null
                ? orgMap.get(task.organization_id)?.name
                : undefined;
            return (
              <li
                key={task.id}
                draggable
                onDragStart={(event) => {
                  setDraggingTaskId(task.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(task.id));
                }}
                onDragOver={(event) => {
                  if (draggingTaskId !== null && draggingTaskId !== task.id) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedId = Number(event.dataTransfer.getData('text/plain')) || draggingTaskId;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const placeAfter = event.clientY > rect.top + rect.height / 2;
                  if (draggedId !== null) moveTaskToDropTarget(draggedId, task.id, placeAfter);
                  setDraggingTaskId(null);
                }}
                onDragEnd={() => setDraggingTaskId(null)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '6px 0',
                  borderBottom: '1px dotted var(--rule)',
                  opacity: draggingTaskId === task.id ? 0.48 : 1,
                }}
              >
                <GripVertical
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  style={{ color: 'var(--ink-3)', flexShrink: 0, transform: 'translateY(2px)' }}
                />
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
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => moveTask(task.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${task.title} up`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      border: '1px solid var(--rule)',
                      borderRadius: 4,
                      background: 'transparent',
                      color: index === 0 ? 'var(--ink-3)' : 'var(--ink-2)',
                      cursor: index === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <ArrowUp size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTask(task.id, 1)}
                    disabled={index === tasks.length - 1}
                    aria-label={`Move ${task.title} down`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      border: '1px solid var(--rule)',
                      borderRadius: 4,
                      background: 'transparent',
                      color: index === tasks.length - 1 ? 'var(--ink-3)' : 'var(--ink-2)',
                      cursor: index === tasks.length - 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <ArrowDown size={12} aria-hidden="true" />
                  </button>
                </div>
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
// Widget 2 — Daily Task Review preview
// ---------------------------------------------------------------------------

function DailyTaskReviewPreviewWidget() {
  const reportsQuery = useReports();
  const report = (reportsQuery.data ?? []).find((item) => item.name.toLowerCase() === 'daily task review') ?? null;
  const runsQuery = useReportRuns(report?.id ?? 0, { enabled: report !== null });
  const latestRun = (runsQuery.data ?? [])
    .filter((run) => run.status === 'done' && run.output_path !== null)
    .sort((a, b) => {
      const aTime = a.finished_at ?? a.started_at;
      const bTime = b.finished_at ?? b.started_at;
      return bTime.localeCompare(aTime);
    })[0] ?? null;

  return (
    <Tile title="Daily Task Review" count={reportsQuery.isLoading || runsQuery.isLoading ? '...' : undefined}>
      {reportsQuery.isError && (
        <TileError message="Couldn't load reports" onRetry={() => void reportsQuery.refetch()} />
      )}
      {!reportsQuery.isError && reportsQuery.isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}>
          Loading report...
        </p>
      )}
      {!reportsQuery.isLoading && !reportsQuery.isError && report === null && (
        <EmptyState text="Daily Task Review report is not configured yet." />
      )}
      {report !== null && runsQuery.isError && (
        <TileError message="Couldn't load report history" onRetry={() => void runsQuery.refetch()} />
      )}
      {report !== null && runsQuery.isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}>
          Loading latest preview...
        </p>
      )}
      {report !== null && !runsQuery.isLoading && !runsQuery.isError && latestRun === null && (
        <EmptyState text="No completed Daily Task Review output yet." />
      )}
      {report !== null && latestRun !== null && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              alignItems: 'baseline',
              color: 'var(--ink-3)',
              fontSize: 11,
              fontFamily: 'var(--body)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>Latest output</span>
            <a
              href={`/api/reports/${report.id}/runs/${latestRun.id}/download`}
              download
              style={{ color: 'var(--ink-2)', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              Download
            </a>
          </div>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            <ReportPreview
              reportId={report.id}
              runId={latestRun.id}
              runDate={latestRun.started_at}
              enabled
            />
          </div>
        </div>
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

const HOME_TASK_ORDER_STORAGE_KEY = 'mastercontrol:home-task-order';

function readHomeTaskOrder(): number[] {
  try {
    const raw = window.localStorage.getItem(HOME_TASK_ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is number => Number.isInteger(item));
  } catch {
    return [];
  }
}

function writeHomeTaskOrder(ids: number[]): void {
  try {
    window.localStorage.setItem(HOME_TASK_ORDER_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage failures; ordering still works for this render.
  }
}

export function HomePage() {
  const now = new Date();
  const dateStr = longDate.format(now);
  const ponderingResponse = getDailyPonderingResponse(now);

  const customersQuery = useOrganizations('customer');
  const oemsQuery = useOrganizations('oem');

  const allOrgs: Organization[] = [
    ...(customersQuery.data ?? []),
    ...(oemsQuery.data ?? []),
  ];

  const orgMap = new Map<number, Organization>(allOrgs.map((o) => [o.id, o]));

  return (
    <div>
      <PageHeader
        eyebrow={PONDERING_PROMPT}
        title={ponderingResponse}
        subtitle={dateStr}
        titleSingleLine
      />

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

        {/* Top-right: latest Daily Task Review preview */}
        <div style={{ gridColumn: 2, gridRow: 1 }}>
          <DailyTaskReviewPreviewWidget />
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
