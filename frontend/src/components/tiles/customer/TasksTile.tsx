import { useState, useCallback, useId, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Task } from '../../../types';
import { useTasks as useTasksReal, useCompleteTask, useCreateTask } from '../../../api/useTasks';
import type { TaskStatus } from '../../../types';
import { TaskEditDialog } from '../../tasks/TaskEditDialog';

interface UseTasksResult {
  data: Task[] | undefined;
  isLoading: boolean;
}

interface UseTaskMutations {
  complete: (taskId: number) => void;
  create: (title: string, orgId: number, dueDate?: string | null) => void;
}

function useTasksForTile(params: { orgId: number; status: string }): UseTasksResult {
  return useTasksReal({ orgId: params.orgId, status: params.status as TaskStatus, kind: 'task' });
}

function useTaskMutationsReal(): UseTaskMutations {
  const { mutate: completeTask } = useCompleteTask();
  const { mutate: createTask } = useCreateTask();
  return {
    complete: (taskId) => completeTask(taskId),
    create: (title, orgId, dueDate) =>
      createTask({ title, organization_id: orgId, due_date: dueDate ?? null, status: 'open', kind: 'task' }),
  };
}

interface TasksTileProps {
  orgId: number;
  _useTasks?: (params: { orgId: number; status: string }) => UseTasksResult;
  _useTaskMutations?: () => UseTaskMutations;
}

/**
 * Returns true if the task is overdue (due_date is before today, ignoring time).
 * Overdue-text is the only vermilion in this tile — transient signal per Q-1.
 */
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
  const d = new Date(dueDate);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

/**
 * TasksTile — open tasks for the org.
 *
 * Uses real <input type="checkbox">, not a styled div.
 * Overdue due-text is vermilion (transient signal per Q-1).
 * Inline "+ Add task" form at the bottom.
 */
export function TasksTile({ orgId, _useTasks, _useTaskMutations }: TasksTileProps) {
  const useTasks = _useTasks ?? useTasksForTile;
  const useTaskMutations = _useTaskMutations ?? useTaskMutationsReal;

  const { data: tasks, isLoading } = useTasks({ orgId, status: 'open' });
  const { complete, create } = useTaskMutations();

  const [addingTask, setAddingTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const formId = useId();
  const newTaskTitleId = `${formId}-title`;
  const newTaskDueId = `${formId}-due`;

  const handleComplete = useCallback(
    (taskId: number) => {
      complete(taskId);
    },
    [complete],
  );

  const handleAddTask = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      create(trimmed, orgId, newDue || null);
      setNewTitle('');
      setNewDue('');
      setAddingTask(false);
    },
    [create, newTitle, newDue, orgId],
  );

  const openTasks = tasks ?? [];

  return (
    <Tile title="Tasks" count={isLoading ? '…' : openTasks.length || undefined}>
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && openTasks.length === 0 && !addingTask && (
        <TileEmptyState
          copy="Nothing due today."
          ariaLive
        />
      )}

      {openTasks.length > 0 && (
        <ul
          role="list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {openTasks.map((task) => {
            const overdue = isOverdue(task.due_date);
            const checkId = `task-${task.id}`;
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
                  defaultChecked={false}
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
                  title={task.title}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: 'var(--ink-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    fontFamily: 'var(--body)',
                    textAlign: 'left',
                  }}
                >
                  {task.title}
                </button>
                {task.due_date && (
                  <time
                    dateTime={task.due_date}
                    style={{
                      fontSize: 11,
                      // Vermilion for overdue — transient signal per Q-1
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

      {/* Add task form */}
      {addingTask ? (
        <form
          onSubmit={handleAddTask}
          style={{
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <label
            htmlFor={newTaskTitleId}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
            }}
          >
            New task title
          </label>
          <input
            id={newTaskTitleId}
            type="text"
            name="task-title"
            autoComplete="off"
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title…"
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 4,
              padding: '5px 8px',
              fontSize: 13,
              background: 'transparent',
              color: 'var(--ink-1)',
              fontFamily: 'var(--body)',
              width: '100%',
            }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label
              htmlFor={newTaskDueId}
              style={{
                fontSize: 12,
                color: 'var(--ink-2)',
                flexShrink: 0,
                fontFamily: 'var(--body)',
              }}
            >
              Due
            </label>
            <input
              id={newTaskDueId}
              type="date"
              name="task-due"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              style={{
                border: '1px solid var(--rule)',
                borderRadius: 4,
                padding: '4px 6px',
                fontSize: 12,
                background: 'transparent',
                color: 'var(--ink-2)',
                fontFamily: 'var(--body)',
                flex: 1,
              }}
            />
            <button
              type="submit"
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: '1px solid var(--rule)',
                borderRadius: 4,
                background: 'var(--bg-2)',
                color: 'var(--ink-1)',
                cursor: 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              Add Task
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingTask(false);
                setNewTitle('');
                setNewDue('');
              }}
              style={{
                padding: '4px 8px',
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
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingTask(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
          }}
        >
          <Plus size={12} strokeWidth={1.5} aria-hidden="true" />
          Add task
        </button>
      )}

      {editingTask && (
        <TaskEditDialog task={editingTask} onClose={() => setEditingTask(null)} />
      )}
    </Tile>
  );
}
