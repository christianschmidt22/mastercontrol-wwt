import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from 'react';
import { ArrowDown, ArrowUp, Edit3, Plus, RefreshCw } from 'lucide-react';
import {
  useCompleteTask,
  useCreateTask,
  useTasks,
  useUpdateTask,
} from '../api/useTasks';
import { useOrganizations } from '../api/useOrganizations';
import { TaskEditDialog } from '../components/tasks/TaskEditDialog';
import { TileEmptyState } from '../components/tiles/TileEmptyState';
import type { Organization, Task, TaskStatus } from '../types';

type SortKey = 'title' | 'organization' | 'status' | 'due_date' | 'created_at' | 'completed_at';
type SortDir = 'asc' | 'desc';
type DueFilter = 'all' | 'today' | 'this-week' | 'overdue' | 'none';

interface SortState {
  key: SortKey;
  dir: SortDir;
}

const STATUS_OPTIONS: Array<TaskStatus | 'all'> = ['all', 'open', 'done', 'snoozed'];
const DUE_OPTIONS: Array<{ value: DueFilter; label: string }> = [
  { value: 'all', label: 'All due dates' },
  { value: 'today', label: 'Due today' },
  { value: 'this-week', label: 'Due this week' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'none', label: 'No due date' },
];

const tableCell: CSSProperties = {
  padding: '9px 10px',
  borderBottom: '1px solid var(--rule)',
  verticalAlign: 'middle',
  fontSize: 13,
};

const headerButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: 0,
  fontFamily: 'var(--body)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const filterControl: CSSProperties = {
  width: '100%',
  minWidth: 0,
  border: '1px solid var(--rule)',
  borderRadius: 4,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 12,
  padding: '5px 7px',
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekEndStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function dateKey(value: string | null): string {
  return value?.slice(0, 10) ?? '';
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return dueDate.slice(0, 10) < todayStr();
}

function matchesDueFilter(task: Task, filter: DueFilter): boolean {
  const due = dateKey(task.due_date);
  if (filter === 'all') return true;
  if (filter === 'none') return !due;
  if (!due) return false;
  if (filter === 'today') return due === todayStr();
  if (filter === 'this-week') return due <= weekEndStr();
  if (filter === 'overdue') return isOverdue(task.due_date) && task.status === 'open';
  return true;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const datePart = value.slice(0, 10);
  const d = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return datePart;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function orgLabel(task: Task, orgMap: Map<number, string>): string {
  return task.organization_id === null ? 'Unassigned' : orgMap.get(task.organization_id) ?? `Org #${task.organization_id}`;
}

function compareNullableDate(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function sortTasks(tasks: Task[], orgMap: Map<number, string>, sort: SortState): Task[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    let result = 0;
    if (sort.key === 'title') result = a.title.localeCompare(b.title);
    if (sort.key === 'organization') result = orgLabel(a, orgMap).localeCompare(orgLabel(b, orgMap));
    if (sort.key === 'status') result = a.status.localeCompare(b.status);
    if (sort.key === 'due_date') result = compareNullableDate(a.due_date, b.due_date);
    if (sort.key === 'created_at') result = compareNullableDate(a.created_at, b.created_at);
    if (sort.key === 'completed_at') result = compareNullableDate(a.completed_at, b.completed_at);
    return result === 0 ? a.id - b.id : result * dir;
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === 'asc'
    ? <ArrowUp size={11} strokeWidth={1.8} aria-hidden="true" />
    : <ArrowDown size={11} strokeWidth={1.8} aria-hidden="true" />;
}

interface HeaderButtonProps {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}

function HeaderButton({ label, sortKey, sort, onSort }: HeaderButtonProps) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={headerButton}
    >
      {label}
      <SortIcon active={active} dir={sort.dir} />
    </button>
  );
}

interface AddTaskFormProps {
  customers: Organization[];
  isCreating: boolean;
  titleRef: RefObject<HTMLInputElement>;
  onCancel: () => void;
  onSubmit: (input: { title: string; dueDate: string; orgId: string }) => void;
}

function AddTaskForm({ customers, isCreating, titleRef, onCancel, onSubmit }: AddTaskFormProps) {
  const titleId = useId();
  const dueId = useId();
  const orgId = useId();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [organizationId, setOrganizationId] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({ title: trimmed, dueDate, orgId: organizationId });
    setTitle('');
    setDueDate('');
    setOrganizationId('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 1fr) 150px 220px auto auto',
        gap: 8,
        alignItems: 'end',
        marginBottom: 16,
        padding: 12,
        border: '1px solid var(--rule)',
        borderRadius: 6,
        background: 'var(--bg-2)',
      }}
    >
      <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--ink-3)' }} htmlFor={titleId}>
        Task
        <input
          id={titleId}
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoComplete="off"
          autoFocus
          style={filterControl}
        />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--ink-3)' }} htmlFor={dueId}>
        Due
        <input
          id={dueId}
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          style={filterControl}
        />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--ink-3)' }} htmlFor={orgId}>
        Customer
        <select
          id={orgId}
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          style={filterControl}
        >
          <option value="">Unassigned</option>
          {customers.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={!title.trim() || isCreating}
        style={{
          border: 'none',
          borderRadius: 4,
          background: 'var(--accent)',
          color: '#fff',
          cursor: !title.trim() || isCreating ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--body)',
          fontSize: 12,
          fontWeight: 700,
          padding: '7px 14px',
          opacity: !title.trim() || isCreating ? 0.6 : 1,
        }}
      >
        {isCreating ? 'Adding...' : 'Add'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          border: '1px solid var(--rule)',
          borderRadius: 4,
          background: 'transparent',
          color: 'var(--ink-2)',
          cursor: 'pointer',
          fontFamily: 'var(--body)',
          fontSize: 12,
          padding: '6px 12px',
        }}
      >
        Cancel
      </button>
    </form>
  );
}

export function TasksPage() {
  const tasksQuery = useTasks();
  const customersQuery = useOrganizations('customer');
  const oemsQuery = useOrganizations('oem');
  const createTask = useCreateTask();
  const completeTask = useCompleteTask();
  const updateTask = useUpdateTask();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'due_date', dir: 'asc' });
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('open');
  const [orgFilter, setOrgFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [titleFilter, setTitleFilter] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const allOrgs = useMemo(
    () => [...(customersQuery.data ?? []), ...(oemsQuery.data ?? [])],
    [customersQuery.data, oemsQuery.data],
  );
  const orgMap = useMemo(() => new Map(allOrgs.map((org) => [org.id, org.name])), [allOrgs]);

  const filteredTasks = useMemo(() => {
    const titleNeedle = titleFilter.trim().toLowerCase();
    const filtered = (tasksQuery.data ?? []).filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (orgFilter !== 'all' && String(task.organization_id ?? 'none') !== orgFilter) return false;
      if (titleNeedle && !task.title.toLowerCase().includes(titleNeedle)) return false;
      return matchesDueFilter(task, dueFilter);
    });
    return sortTasks(filtered, orgMap, sort);
  }, [dueFilter, orgFilter, orgMap, sort, statusFilter, tasksQuery.data, titleFilter]);

  const openCount = (tasksQuery.data ?? []).filter((task) => task.status === 'open').length;
  const dueTodayCount = (tasksQuery.data ?? []).filter(
    (task) => task.status === 'open' && dateKey(task.due_date) === todayStr(),
  ).length;

  const handleSort = useCallback((key: SortKey) => {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    ));
  }, []);

  const resetFilters = useCallback(() => {
    setStatusFilter('open');
    setOrgFilter('all');
    setDueFilter('all');
    setTitleFilter('');
    setSort({ key: 'due_date', dir: 'asc' });
  }, []);

  const handleCheckChange = useCallback(
    (task: Task, checked: boolean) => {
      if (checked) {
        completeTask.mutate(task.id);
      } else {
        updateTask.mutate({ id: task.id, status: 'open' });
      }
    },
    [completeTask, updateTask],
  );

  const handleCreate = useCallback(
    ({ title, dueDate, orgId }: { title: string; dueDate: string; orgId: string }) => {
      createTask.mutate(
        {
          title,
          due_date: dueDate || null,
          organization_id: orgId ? Number(orgId) : null,
          status: 'open',
        },
        { onSuccess: () => setShowAddForm(false) },
      );
    },
    [createTask],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'n') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      e.preventDefault();
      setShowAddForm(true);
      requestAnimationFrame(() => titleInputRef.current?.focus());
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div>
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginBottom: 8,
        }}
      >
        TASKS
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end' }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontSize: 48,
              fontWeight: 500,
              lineHeight: 1.04,
              margin: 0,
            }}
          >
            Tasks
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--ink-2)', fontSize: 14 }}>
            {openCount} open{dueTodayCount > 0 ? ` · ${dueTodayCount} due today` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAddForm(true);
            requestAnimationFrame(() => titleInputRef.current?.focus());
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            border: '1px solid var(--rule)',
            borderRadius: 5,
            background: 'var(--bg-2)',
            color: 'var(--ink-1)',
            cursor: 'pointer',
            fontFamily: 'var(--body)',
            fontSize: 13,
            padding: '7px 12px',
          }}
        >
          <Plus size={14} strokeWidth={1.7} aria-hidden="true" />
          Add task
        </button>
      </div>

      <div
        style={{
          marginTop: 22,
          background: 'var(--surface)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: 16,
        }}
      >
        {showAddForm && (
          <AddTaskForm
            customers={customersQuery.data ?? []}
            isCreating={createTask.isPending}
            titleRef={titleInputRef}
            onCancel={() => setShowAddForm(false)}
            onSubmit={handleCreate}
          />
        )}

        {tasksQuery.isError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)' }}>
            Couldn't load tasks
            <button
              type="button"
              onClick={() => void tasksQuery.refetch()}
              style={{ ...headerButton, color: 'var(--ink-1)' }}
            >
              <RefreshCw size={12} aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {!tasksQuery.isError && (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 900,
                fontFamily: 'var(--body)',
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...tableCell, width: 42, textAlign: 'left' }} />
                  <th style={{ ...tableCell, textAlign: 'left', minWidth: 240 }}>
                    <HeaderButton label="Task" sortKey="title" sort={sort} onSort={handleSort} />
                  </th>
                  <th style={{ ...tableCell, textAlign: 'left', minWidth: 170 }}>
                    <HeaderButton label="Organization" sortKey="organization" sort={sort} onSort={handleSort} />
                  </th>
                  <th style={{ ...tableCell, textAlign: 'left', width: 130 }}>
                    <HeaderButton label="Status" sortKey="status" sort={sort} onSort={handleSort} />
                  </th>
                  <th style={{ ...tableCell, textAlign: 'left', width: 145 }}>
                    <HeaderButton label="Due" sortKey="due_date" sort={sort} onSort={handleSort} />
                  </th>
                  <th style={{ ...tableCell, textAlign: 'left', width: 145 }}>
                    <HeaderButton label="Created" sortKey="created_at" sort={sort} onSort={handleSort} />
                  </th>
                  <th style={{ ...tableCell, textAlign: 'left', width: 145 }}>
                    <HeaderButton label="Completed" sortKey="completed_at" sort={sort} onSort={handleSort} />
                  </th>
                  <th style={{ ...tableCell, width: 48 }} />
                </tr>
                <tr>
                  <th style={tableCell}>
                    <button type="button" onClick={resetFilters} style={{ ...headerButton, color: 'var(--ink-3)' }}>
                      Reset
                    </button>
                  </th>
                  <th style={tableCell}>
                    <input
                      aria-label="Filter tasks by title"
                      value={titleFilter}
                      onChange={(e) => setTitleFilter(e.target.value)}
                      placeholder="Filter title"
                      style={filterControl}
                    />
                  </th>
                  <th style={tableCell}>
                    <select
                      aria-label="Filter tasks by organization"
                      value={orgFilter}
                      onChange={(e) => setOrgFilter(e.target.value)}
                      style={filterControl}
                    >
                      <option value="all">All organizations</option>
                      <option value="none">Unassigned</option>
                      {allOrgs.map((org) => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </th>
                  <th style={tableCell}>
                    <select
                      aria-label="Filter tasks by status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
                      style={filterControl}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>
                      ))}
                    </select>
                  </th>
                  <th style={tableCell}>
                    <select
                      aria-label="Filter tasks by due date"
                      value={dueFilter}
                      onChange={(e) => setDueFilter(e.target.value as DueFilter)}
                      style={filterControl}
                    >
                      {DUE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </th>
                  <th style={tableCell} />
                  <th style={tableCell} />
                  <th style={tableCell} />
                </tr>
              </thead>
              <tbody>
                {tasksQuery.isLoading && (
                  <tr>
                    <td colSpan={8} style={{ ...tableCell, color: 'var(--ink-3)' }}>Loading...</td>
                  </tr>
                )}
                {!tasksQuery.isLoading && filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={8} style={tableCell}>
                      <TileEmptyState copy="No tasks match the current table filters." ariaLive />
                    </td>
                  </tr>
                )}
                {filteredTasks.map((task) => (
                  <tr key={task.id}>
                    <td style={tableCell}>
                      <input
                        type="checkbox"
                        checked={task.status === 'done'}
                        aria-label={
                          task.status === 'done'
                            ? `Reopen task: ${task.title}`
                            : `Mark complete: ${task.title}`
                        }
                        onChange={(e) => handleCheckChange(task, e.currentTarget.checked)}
                        style={{ width: 15, height: 15, accentColor: 'var(--ink-3)', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ ...tableCell, color: 'var(--ink-1)', fontWeight: 600 }}>
                      <button
                        type="button"
                        onClick={() => setEditingTask(task)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'inherit',
                          cursor: 'pointer',
                          font: 'inherit',
                          padding: 0,
                          textAlign: 'left',
                          textDecoration: task.status === 'done' ? 'line-through' : 'none',
                        }}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{orgLabel(task, orgMap)}</td>
                    <td style={{ ...tableCell, color: task.status === 'open' ? 'var(--ink-1)' : 'var(--ink-3)' }}>
                      {task.status}
                    </td>
                    <td style={{ ...tableCell, color: isOverdue(task.due_date) && task.status === 'open' ? 'var(--accent)' : 'var(--ink-2)' }}>
                      {formatDate(task.due_date)}
                    </td>
                    <td style={{ ...tableCell, color: 'var(--ink-3)' }}>{formatDate(task.created_at)}</td>
                    <td style={{ ...tableCell, color: 'var(--ink-3)' }}>{formatDate(task.completed_at)}</td>
                    <td style={tableCell}>
                      <button
                        type="button"
                        aria-label={`Edit task: ${task.title}`}
                        onClick={() => setEditingTask(task)}
                        style={{
                          border: '1px solid var(--rule)',
                          borderRadius: 4,
                          background: 'transparent',
                          color: 'var(--ink-3)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          padding: 5,
                        }}
                      >
                        <Edit3 size={13} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingTask && <TaskEditDialog task={editingTask} onClose={() => setEditingTask(null)} />}
    </div>
  );
}
