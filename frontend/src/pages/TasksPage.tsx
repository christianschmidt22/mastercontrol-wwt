import {
  useState,
  useCallback,
  useId,
  type FormEvent,
  type CSSProperties,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import {
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCompleteTask,
} from '../api/useTasks';
import { useOrganizations } from '../api/useOrganizations';
import { useContacts } from '../api/useContacts';
import type { Task, TaskStatus, TaskUpdate } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DueFilter = 'today' | 'this-week' | 'overdue' | 'any';

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

/** Apply the due-date filter client-side (since the API only supports dueBefore). */
function applyDueFilter(tasks: Task[], due: DueFilter): Task[] {
  if (due === 'any') return tasks;
  if (due === 'today') return tasks.filter((t) => isDueToday(t.due_date));
  if (due === 'overdue') return tasks.filter((t) => isOverdue(t.due_date));
  if (due === 'this-week') {
    const end = weekEndStr();
    return tasks.filter(
      (t) => t.due_date !== null && t.due_date <= end,
    );
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Sub-components
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
                outline: 'none',
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
// Inline editor for a single task row
// ---------------------------------------------------------------------------

interface TaskRowEditorProps {
  task: Task;
  orgOptions: { id: number; name: string }[];
  onSave: (update: { id: number } & TaskUpdate) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function TaskRowEditor({
  task,
  orgOptions,
  onSave,
  onCancel,
  isSaving,
}: TaskRowEditorProps) {
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [orgId, setOrgId] = useState<string>(
    task.organization_id !== null ? String(task.organization_id) : '',
  );

  const titleId = useId();
  const dueId = useId();
  const statusId = useId();
  const orgEditorId = useId();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave({
      id: task.id,
      title: trimmed,
      due_date: dueDate || null,
      status,
      organization_id: orgId ? parseInt(orgId, 10) : null,
    });
  };

  const inputStyle: CSSProperties = {
    border: '1px solid var(--rule)',
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 13,
    background: 'transparent',
    color: 'var(--ink-1)',
    fontFamily: 'var(--body)',
    width: '100%',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 0',
      }}
    >
      <div>
        <label
          htmlFor={titleId}
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
            display: 'block',
            marginBottom: 3,
          }}
        >
          Title
        </label>
        <input
          id={titleId}
          type="text"
          name="edit-title"
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label
            htmlFor={dueId}
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Due date
          </label>
          <input
            id={dueId}
            type="date"
            name="edit-due"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={{ ...inputStyle }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label
            htmlFor={statusId}
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Status
          </label>
          <select
            id={statusId}
            name="edit-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            style={{ ...inputStyle }}
          >
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="snoozed">Snoozed</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label
            htmlFor={orgEditorId}
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              display: 'block',
              marginBottom: 3,
            }}
          >
            Organization
          </label>
          <select
            id={orgEditorId}
            name="edit-org"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            style={{ ...inputStyle }}
          >
            <option value="">None</option>
            {orgOptions.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="submit"
          disabled={isSaving || !title.trim()}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            padding: '5px 12px',
            borderRadius: 4,
            cursor: isSaving || !title.trim() ? 'default' : 'pointer',
            border: '1px solid var(--rule)',
            background: 'var(--bg-2)',
            color: 'var(--ink-1)',
          }}
        >
          {isSaving ? 'Saving…' : 'Save task'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            padding: '5px 12px',
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
// Task row (collapsed + expanded)
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: Task;
  orgName: string | undefined;
  orgOptions: { id: number; name: string }[];
  onComplete: (id: number) => void;
  onDelete: (id: number) => void;
  onSave: (update: { id: number } & TaskUpdate) => void;
  isUpdating: boolean;
}

function TaskRow({
  task,
  orgName,
  orgOptions,
  onComplete,
  onDelete,
  onSave,
  isUpdating,
}: TaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const checkId = `task-check-${task.id}`;
  const overdue = isOverdue(task.due_date);

  const handleSave = useCallback(
    (update: { id: number } & TaskUpdate) => {
      onSave(update);
      setEditing(false);
      setExpanded(false);
    },
    [onSave],
  );

  return (
    <li
      style={{
        borderBottom: '1px dotted var(--rule)',
      }}
    >
      {/* Main row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '8px 0',
          cursor: 'pointer',
        }}
      >
        <label
          htmlFor={checkId}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            flex: 1,
            cursor: 'pointer',
            minWidth: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            id={checkId}
            type="checkbox"
            checked={task.status === 'done'}
            onChange={() => onComplete(task.id)}
            style={{
              width: 14,
              height: 14,
              flexShrink: 0,
              cursor: 'pointer',
              accentColor: 'var(--ink-3)',
              transform: 'translateY(2px)',
            }}
          />
          <div
            style={{ flex: 1, minWidth: 0 }}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={() => setExpanded((x) => !x)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpanded((x) => !x);
              }
            }}
          >
            <span
              style={{
                fontSize: 16,
                color: 'var(--ink-1)',
                fontFamily: 'var(--body)',
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
                  fontFamily: 'var(--body)',
                  display: 'block',
                  marginTop: 1,
                }}
              >
                {orgName}
              </span>
            )}
          </div>
        </label>

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

      {/* Expanded detail */}
      {expanded && !editing && (
        <div
          style={{
            padding: '0 0 12px 24px',
          }}
        >
          {task.due_date && (
            <p
              style={{
                fontSize: 13,
                color: 'var(--ink-2)',
                fontFamily: 'var(--body)',
                margin: '0 0 6px',
              }}
            >
              Due{' '}
              <time
                dateTime={task.due_date}
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: overdue ? 'var(--accent)' : 'inherit',
                }}
              >
                {new Intl.DateTimeFormat('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                }).format(new Date(task.due_date + 'T00:00:00'))}
              </time>
            </p>
          )}
          <p
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              margin: '0 0 8px',
            }}
          >
            Created{' '}
            {new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }).format(new Date(task.created_at))}
            {task.completed_at && (
              <>
                {' · Completed '}
                {new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }).format(new Date(task.completed_at))}
              </>
            )}
          </p>
          {orgName && (
            <p
              style={{
                fontSize: 12,
                color: 'var(--ink-3)',
                fontFamily: 'var(--body)',
                margin: '0 0 8px',
              }}
            >
              Organization: {orgName}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                fontFamily: 'var(--body)',
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                border: '1px solid var(--rule)',
                background: 'transparent',
                color: 'var(--ink-2)',
              }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              style={{
                fontFamily: 'var(--body)',
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                border: '1px solid var(--rule)',
                background: 'transparent',
                color: 'var(--ink-2)',
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Inline editor */}
      {editing && (
        <div style={{ padding: '0 0 8px 24px' }}>
          <TaskRowEditor
            task={task}
            orgOptions={orgOptions}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            isSaving={isUpdating}
          />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Add task form
// ---------------------------------------------------------------------------

interface AddTaskFormProps {
  orgOptions: { id: number; name: string }[];
  onSubmit: (data: {
    title: string;
    dueDate: string;
    orgId: string;
    contactId: string;
  }) => void;
  onCancel: () => void;
  isCreating: boolean;
}

function AddTaskForm({
  orgOptions,
  onSubmit,
  onCancel,
  isCreating,
}: AddTaskFormProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [orgId, setOrgId] = useState('');
  const [contactId, setContactId] = useState('');

  const titleId = useId();
  const dueId = useId();
  const orgSelectId = useId();
  const contactSelectId = useId();

  // Contacts filtered by selected org
  const { data: contacts = [] } = useContacts(
    orgId ? parseInt(orgId, 10) : 0,
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({ title: trimmed, dueDate, orgId, contactId });
    setTitle('');
    setDueDate('');
    setOrgId('');
    setContactId('');
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

  const labelStyle: CSSProperties = {
    fontSize: 11,
    color: 'var(--ink-3)',
    fontFamily: 'var(--body)',
    display: 'block',
    marginBottom: 3,
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 6,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--bg-2)',
        marginBottom: 16,
      }}
    >
      <div>
        <label htmlFor={titleId} style={labelStyle}>
          Task title
        </label>
        <input
          id={titleId}
          type="text"
          name="new-task-title"
          autoComplete="off"
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor={dueId} style={labelStyle}>
            Due date
          </label>
          <input
            id={dueId}
            type="date"
            name="new-task-due"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label htmlFor={orgSelectId} style={labelStyle}>
            Organization
          </label>
          <select
            id={orgSelectId}
            name="new-task-org"
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value);
              setContactId('');
            }}
            style={inputStyle}
          >
            <option value="">None</option>
            {orgOptions.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {orgId && (
          <div style={{ flex: 1 }}>
            <label htmlFor={contactSelectId} style={labelStyle}>
              Contact (optional)
            </label>
            <select
              id={contactSelectId}
              name="new-task-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              style={inputStyle}
            >
              <option value="">None</option>
              {contacts.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="submit"
          disabled={isCreating || !title.trim()}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            padding: '6px 14px',
            borderRadius: 4,
            cursor: isCreating || !title.trim() ? 'default' : 'pointer',
            border: '1px solid var(--rule)',
            background: 'var(--bg)',
            color: 'var(--ink-1)',
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

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This week' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'any', label: 'Any time' },
];

const DEFAULT_STATUS: TaskStatus = 'open';
const DEFAULT_DUE: DueFilter = 'any';

export function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filter state from URL
  const statusParam = searchParams.get('status');
  const dueParam = searchParams.get('due');
  const orgParam = searchParams.get('org');

  const status: TaskStatus | 'all' =
    statusParam === 'done' || statusParam === 'snoozed' || statusParam === 'open'
      ? statusParam
      : statusParam === 'all'
      ? 'all'
      : DEFAULT_STATUS;

  const due: DueFilter =
    dueParam === 'today' ||
    dueParam === 'this-week' ||
    dueParam === 'overdue' ||
    dueParam === 'any'
      ? dueParam
      : DEFAULT_DUE;

  const orgFilterId = orgParam ? parseInt(orgParam, 10) : undefined;

  // Write filter state back to URL
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

  const setDue = useCallback(
    (v: DueFilter) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (v === DEFAULT_DUE) {
          next.delete('due');
        } else {
          next.set('due', v);
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
  }, [setSearchParams]);

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
  const { mutate: updateTask, isPending: isUpdating } = useUpdateTask();
  const { mutate: deleteTask } = useDeleteTask();
  const { mutate: completeTask } = useCompleteTask();

  const [showAddForm, setShowAddForm] = useState(false);

  // Apply due filter client-side
  const rawTasks = tasksQuery.data ?? [];
  const filteredTasks = applyDueFilter(rawTasks, due);

  // Subtitle counts
  const openCount = filteredTasks.filter((t) => t.status === 'open').length;
  const todayCount = filteredTasks.filter((t) => isDueToday(t.due_date) && t.status === 'open').length;

  const subtitleParts: string[] = [];
  if (status === 'open' || status === 'all') {
    subtitleParts.push(
      `${new Intl.NumberFormat('en-US').format(openCount)} open`,
    );
  }
  if (todayCount > 0 && due === 'any') {
    subtitleParts.push(
      `${new Intl.NumberFormat('en-US').format(todayCount)} due today`,
    );
  }
  const subtitle = subtitleParts.join(' · ');

  const orgSelectId = useId();
  const isFiltered =
    status !== DEFAULT_STATUS ||
    due !== DEFAULT_DUE ||
    orgFilterId !== undefined;

  const handleCreate = ({
    title,
    dueDate,
    orgId,
    contactId,
  }: {
    title: string;
    dueDate: string;
    orgId: string;
    contactId: string;
  }) => {
    createTask({
      title,
      due_date: dueDate || null,
      organization_id: orgId ? parseInt(orgId, 10) : null,
      contact_id: contactId ? parseInt(contactId, 10) : null,
      status: 'open',
    });
    setShowAddForm(false);
  };

  const handleUpdate = useCallback(
    (update: { id: number } & TaskUpdate) => {
      updateTask(update);
    },
    [updateTask],
  );

  const handleComplete = useCallback(
    (id: number) => {
      completeTask(id);
    },
    [completeTask],
  );

  const handleDelete = useCallback(
    (id: number) => {
      deleteTask(id);
    },
    [deleteTask],
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

      {/* Sticky filter bar */}
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
        <ChipGroup
          label="Due"
          options={DUE_OPTIONS}
          value={due}
          onChange={setDue}
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
            orgOptions={allOrgs}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            isCreating={isCreating}
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
            <div
              style={{
                border: '1px dashed var(--rule)',
                borderRadius: 6,
                padding: '24px 20px',
                textAlign: 'center',
                fontSize: 14,
                color: 'var(--ink-2)',
                fontFamily: 'var(--body)',
                lineHeight: 1.6,
              }}
            >
              {isFiltered
                ? 'No tasks match these filters.'
                : 'No open tasks. Add one with ⌘N or the + Add task button above.'}
            </div>
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
                orgOptions={allOrgs}
                onComplete={handleComplete}
                onDelete={handleDelete}
                onSave={handleUpdate}
                isUpdating={isUpdating}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
