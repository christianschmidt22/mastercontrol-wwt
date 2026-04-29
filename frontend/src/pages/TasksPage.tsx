import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useId,
  type FormEvent,
  type CSSProperties,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import {
  useTasks,
  useCreateTask,
  useCompleteTask,
} from '../api/useTasks';
import { useOrganizations } from '../api/useOrganizations';
import { TileEmptyState } from '../components/tiles/TileEmptyState';
import { TaskEditDialog } from '../components/tasks/TaskEditDialog';
import type { Task, TaskStatus } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QuickFilter = 'all' | 'today' | 'this-week' | 'overdue';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekEndStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return dueDate.slice(0, 10) === todayStr();
}

function formatDue(dueDate: string | null): string {
  if (!dueDate) return '';
  const d = new Date(dueDate + 'T00:00:00');
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** Apply the quick-filter client-side. */
function applyQuickFilter(tasks: Task[], filter: QuickFilter): Task[] {
  if (filter === 'all') return tasks;
  if (filter === 'today') return tasks.filter((t) => isDueToday(t.due_date));
  if (filter === 'overdue') return tasks.filter((t) => isOverdue(t.due_date));
  if (filter === 'this-week') {
    const end = weekEndStr();
    return tasks.filter(
      (t) => t.due_date !== null && t.due_date <= end,
    );
  }
  return tasks;
}

function getEmptyCopy(
  quickFilter: QuickFilter,
  isStatusFiltered: boolean,
): string {
  if (quickFilter === 'today') return 'No tasks due today.';
  if (quickFilter === 'overdue') return 'No overdue tasks — nice work.';
  if (quickFilter === 'this-week') return 'No tasks due this week.';
  if (isStatusFiltered) return 'No tasks match these filters.';
  return 'No open tasks. Add one with Ctrl+N or the + Add task button above.';
}

function useReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

// ---------------------------------------------------------------------------
// DuePills — quick-filter tab bar, local state only
// ---------------------------------------------------------------------------

const QUICK_FILTER_OPTIONS: { value: QuickFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This week' },
  { value: 'overdue', label: 'Overdue' },
];

interface DuePillsProps {
  value: QuickFilter;
  onChange: (v: QuickFilter) => void;
}

function DuePills({ value, onChange }: DuePillsProps) {
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (
    e: ReactKeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (idx + 1) % QUICK_FILTER_OPTIONS.length;
      const nextOpt = QUICK_FILTER_OPTIONS[nextIdx];
      if (nextOpt) { onChange(nextOpt.value); pillRefs.current[nextIdx]?.focus(); }
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx =
        (idx - 1 + QUICK_FILTER_OPTIONS.length) % QUICK_FILTER_OPTIONS.length;
      const prevOpt = QUICK_FILTER_OPTIONS[prevIdx];
      if (prevOpt) { onChange(prevOpt.value); pillRefs.current[prevIdx]?.focus(); }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Filter by due date"
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--rule)',
        marginBottom: 16,
      }}
    >
      {QUICK_FILTER_OPTIONS.map((opt, idx) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            ref={(el) => {
              pillRefs.current[idx] = el;
            }}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            style={{
              fontFamily: 'var(--body)',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: active
                ? '2px solid var(--accent)'
                : '2px solid transparent',
              color: active ? 'var(--ink-1)' : 'var(--ink-2)',
              cursor: 'pointer',
              marginBottom: -1,
              transition:
                'color 150ms var(--ease), border-color 150ms var(--ease)',
            }}
            className="focus-visible:ring-2 focus-visible:ring-[--accent]"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status chip group (URL-synced)
// ---------------------------------------------------------------------------

interface ChipGroupProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChipGroupProps<T>) {
  return (
    <fieldset
      style={{
        border: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <legend
        style={{
          float: 'left',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontFamily: 'var(--body)',
          marginRight: 8,
          paddingTop: 2,
        }}
      >
        {label}
      </legend>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              style={{
                fontFamily: 'var(--body)',
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                padding: '4px 10px',
                borderRadius: 20,
                cursor: 'pointer',
                border: '1px solid var(--rule)',
                background: active ? 'var(--bg-2)' : 'transparent',
                color: active ? 'var(--ink-1)' : 'var(--ink-2)',
                transition:
                  'background-color 150ms var(--ease), color 150ms var(--ease)',
              }}
              className="focus-visible:ring-2 focus-visible:ring-[--accent]"
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Task row (collapsed + expanded)
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: Task;
  orgName: string | undefined;
  onComplete: (id: number) => void;
  completing: boolean;
}

function TaskRow({
  task,
  orgName,
  onComplete,
  completing,
}: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const checkId = `task-check-${task.id}`;
  const overdue = isOverdue(task.due_date);
  const prefersReducedMotion = useReducedMotion();

  return (
    <li
      style={{
        borderBottom: '1px dotted var(--rule)',
        opacity: completing && !prefersReducedMotion ? 0 : 1,
        transform:
          completing && !prefersReducedMotion
            ? 'translateY(-6px)'
            : 'translateY(0)',
        transition: !prefersReducedMotion
          ? 'opacity 240ms cubic-bezier(0.2, 0.0, 0.0, 1.0), transform 240ms cubic-bezier(0.2, 0.0, 0.0, 1.0)'
          : 'none',
        pointerEvents: completing ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '8px 0',
        }}
      >
        <input
          id={checkId}
          type="checkbox"
          aria-label={`Mark complete: ${task.title}`}
          checked={task.status === 'done'}
          onChange={() => onComplete(task.id)}
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
          onClick={() => setEditing(true)}
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
              fontSize: 16,
              color: 'var(--ink-1)',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration: task.status === 'done' ? 'line-through' : 'none',
              opacity: task.status === 'done' ? 0.5 : 1,
            }}
          >
            {task.title}
          </span>
          {orgName && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--ink-3)',
                display: 'block',
                marginTop: 1,
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
              fontSize: 13,
              color: overdue ? 'var(--accent)' : 'var(--ink-3)',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            {formatDue(task.due_date)}
          </time>
        )}
      </div>

      {editing && (
        <TaskEditDialog task={task} onClose={() => setEditing(false)} />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Inline add-task form — one-line layout, customers only
// ---------------------------------------------------------------------------

interface AddTaskFormProps {
  customerOptions: { id: number; name: string }[];
  onSubmit: (data: { title: string; dueDate: string; orgId: string }) => void;
  onCancel: () => void;
  isCreating: boolean;
  titleInputRef?: RefObject<HTMLInputElement>;
}

function AddTaskForm({
  customerOptions,
  onSubmit,
  onCancel,
  isCreating,
  titleInputRef,
}: AddTaskFormProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [orgId, setOrgId] = useState('');

  const titleId = useId();
  const dueId = useId();
  const orgSelectId = useId();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({ title: trimmed, dueDate, orgId });
    setTitle('');
    setDueDate('');
    setOrgId('');
  };

  const inputStyle: CSSProperties = {
    border: '1px solid var(--rule)',
    borderRadius: 4,
    padding: '6px 8px',
    fontSize: 13,
    background: 'transparent',
    color: 'var(--ink-1)',
    fontFamily: 'var(--body)',
    width: '100%',
  };

  const srOnly: CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 6,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        background: 'var(--bg-2)',
        marginBottom: 16,
        flexWrap: 'wrap',
      }}
    >
      {/* Title */}
      <div style={{ flex: '2 1 160px', minWidth: 0 }}>
        <label htmlFor={titleId} style={srOnly}>
          Task title
        </label>
        <input
          id={titleId}
          ref={titleInputRef}
          type="text"
          name="new-task-title"
          autoComplete="off"
          autoFocus
          required
          maxLength={200}
          aria-label="New task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          style={inputStyle}
        />
      </div>

      {/* Due date */}
      <div style={{ flex: '0 1 140px' }}>
        <label htmlFor={dueId} style={srOnly}>
          Due date
        </label>
        <input
          id={dueId}
          type="date"
          name="new-task-due"
          aria-label="Due date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Customer org */}
      <div style={{ flex: '1 1 140px' }}>
        <label htmlFor={orgSelectId} style={srOnly}>
          Organization
        </label>
        <select
          id={orgSelectId}
          name="new-task-org"
          aria-label="Organization"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          style={inputStyle}
        >
          <option value="">No org</option>
          {customerOptions.map((o) => (
            <option key={o.id} value={String(o.id)}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="submit"
          disabled={isCreating || !title.trim()}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 14px',
            borderRadius: 4,
            cursor: isCreating || !title.trim() ? 'default' : 'pointer',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            opacity: isCreating || !title.trim() ? 0.55 : 1,
            transition: 'opacity 150ms var(--ease)',
          }}
        >
          {isCreating ? 'Adding…' : 'Add task'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            border: '1px solid var(--rule)',
            background: 'transparent',
            color: 'var(--ink-2)',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// TasksPage
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'snoozed', label: 'Snoozed' },
  { value: 'all', label: 'All' },
];

const DEFAULT_STATUS: TaskStatus = 'open';

export function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Status + org remain URL-synced for shareability
  const statusParam = searchParams.get('status');
  const orgParam = searchParams.get('org');

  const status: TaskStatus | 'all' =
    statusParam === 'done' ||
    statusParam === 'snoozed' ||
    statusParam === 'open'
      ? statusParam
      : statusParam === 'all'
      ? 'all'
      : DEFAULT_STATUS;

  const orgFilterId = orgParam ? parseInt(orgParam, 10) : undefined;

  const setStatus = useCallback(
    (v: TaskStatus | 'all') => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (v === DEFAULT_STATUS) {
          next.delete('status');
        } else {
          next.set('status', v);
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const setOrgFilter = useCallback(
    (v: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (!v) {
          next.delete('org');
        } else {
          next.set('org', v);
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const resetFilters = useCallback(() => {
    setSearchParams({});
    setQuickFilter('all');
  }, [setSearchParams]);

  // Quick filter — component-local, not URL-synced
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  // Data
  const tasksQuery = useTasks({
    status: status === 'all' ? undefined : status,
    orgId: orgFilterId,
  });

  const customersQuery = useOrganizations('customer');
  const oemsQuery = useOrganizations('oem');

  const allOrgs = [
    ...(customersQuery.data ?? []),
    ...(oemsQuery.data ?? []),
  ];

  const orgMap = new Map(allOrgs.map((o) => [o.id, o.name]));

  const { mutate: createTask, isPending: isCreating } = useCreateTask();
  const { mutate: completeTask } = useCompleteTask();

  const [showAddForm, setShowAddForm] = useState(false);
  const addTaskTitleRef = useRef<HTMLInputElement>(null);

  // Optimistic completion: track which IDs are animating out
  const [completingIds, setCompletingIds] = useState<Set<number>>(new Set());

  // Ctrl+N / Cmd+N — open the add-task form and focus the title input.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'n') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      setShowAddForm(true);
      requestAnimationFrame(() => {
        addTaskTitleRef.current?.focus();
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Apply quick filter client-side
  const rawTasks = tasksQuery.data ?? [];
  const filteredTasks = applyQuickFilter(rawTasks, quickFilter);

  // Subtitle counts
  const openCount = filteredTasks.filter((t) => t.status === 'open').length;
  const todayCount = filteredTasks.filter(
    (t) => isDueToday(t.due_date) && t.status === 'open',
  ).length;

  const subtitleParts: string[] = [];
  if (status === 'open' || status === 'all') {
    subtitleParts.push(
      `${new Intl.NumberFormat('en-US').format(openCount)} open`,
    );
  }
  if (todayCount > 0 && quickFilter === 'all') {
    subtitleParts.push(
      `${new Intl.NumberFormat('en-US').format(todayCount)} due today`,
    );
  }
  const subtitle = subtitleParts.join(' · ');

  const orgSelectId = useId();
  const isStatusFiltered = status !== DEFAULT_STATUS || orgFilterId !== undefined;
  const isFiltered = isStatusFiltered || quickFilter !== 'all';

  const handleCreate = ({
    title,
    dueDate,
    orgId,
  }: {
    title: string;
    dueDate: string;
    orgId: string;
  }) => {
    createTask({
      title,
      due_date: dueDate || null,
      organization_id: orgId ? parseInt(orgId, 10) : null,
      status: 'open',
    });
    setShowAddForm(false);
  };

  const handleComplete = useCallback(
    (id: number) => {
      setCompletingIds((prev) => new Set([...prev, id]));
      completeTask(id, {
        onSettled: () => {
          setCompletingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      });
    },
    [completeTask],
  );

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
        TASKS
      </p>
      <h1
        style={{
          fontFamily: 'var(--display)',
          fontSize: 56,
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          marginLeft: -3,
          marginBottom: 4,
          textWrap: 'balance',
        }}
      >
        Tasks
      </h1>
      {subtitle && (
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            marginBottom: 24,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {subtitle}
        </p>
      )}

      {/* Sticky status + org filter bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--bg)',
          borderBottom: '1px solid var(--rule)',
          padding: '10px 0 12px',
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <ChipGroup
          label="Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            htmlFor={orgSelectId}
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
            }}
          >
            Org
          </label>
          <select
            id={orgSelectId}
            name="filter-org"
            value={orgFilterId !== undefined ? String(orgFilterId) : ''}
            onChange={(e) => setOrgFilter(e.target.value)}
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 12,
              background: 'transparent',
              color: 'var(--ink-1)',
              fontFamily: 'var(--body)',
              cursor: 'pointer',
            }}
          >
            <option value="">All</option>
            {allOrgs.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={resetFilters}
            style={{
              fontFamily: 'var(--body)',
              fontSize: 12,
              background: 'none',
              border: 'none',
              padding: '4px 0',
              cursor: 'pointer',
              color: 'var(--ink-3)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Content area — max 70ch */}
      <div style={{ maxWidth: '70ch' }}>
        {/* Add task trigger / form */}
        {showAddForm ? (
          <AddTaskForm
            customerOptions={customersQuery.data ?? []}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            isCreating={isCreating}
            titleInputRef={addTaskTitleRef}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 16,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
            }}
          >
            <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
            + Add task
          </button>
        )}

        {/* Quick-filter pills — above task list, local state */}
        <DuePills value={quickFilter} onChange={setQuickFilter} />

        {/* Error state */}
        {tasksQuery.isError && (
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
            Couldn't load tasks
            <button
              type="button"
              onClick={() => void tasksQuery.refetch()}
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
        )}

        {/* Loading */}
        {tasksQuery.isLoading && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
            }}
          >
            Loading…
          </p>
        )}

        {/* Empty state */}
        {!tasksQuery.isLoading &&
          !tasksQuery.isError &&
          filteredTasks.length === 0 && (
            <TileEmptyState
              copy={getEmptyCopy(quickFilter, isStatusFiltered)}
              ariaLive
            />
          )}

        {/* Task list */}
        {filteredTasks.length > 0 && (
          <ul
            role="list"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
            }}
          >
            {filteredTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                orgName={
                  task.organization_id !== null
                    ? orgMap.get(task.organization_id)
                    : undefined
                }
                onComplete={handleComplete}
                completing={completingIds.has(task.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
