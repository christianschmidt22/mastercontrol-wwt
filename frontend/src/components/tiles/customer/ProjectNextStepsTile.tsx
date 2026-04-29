import { useState, useCallback, type FormEvent, type CSSProperties } from 'react';
import { Check, Plus, RotateCcw } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import {
  useTasks as useTasksReal,
  useCompleteTask,
  useCreateTask,
  useUpdateTask,
} from '../../../api/useTasks';
import type { Task } from '../../../types';

interface ProjectNextStepsTileProps {
  projectId: number;
  orgId: number;
  _useTasks?: (params: { projectId: number }) => { data: Task[] | undefined; isLoading: boolean };
  _useTaskMutations?: () => {
    complete: (taskId: number) => void;
    reopen: (taskId: number) => void;
    create: (
      body: {
        title: string;
        organization_id: number;
        project_id: number;
        due_date: string | null;
      },
      options?: { onSuccess?: () => void },
    ) => void;
    isCreating: boolean;
  };
}

const inputCss: CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 4,
  padding: '5px 8px',
  fontSize: 13,
  background: 'transparent',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  width: '100%',
  boxSizing: 'border-box',
};

function useTasksForTile(params: { projectId: number }) {
  return useTasksReal({ projectId: params.projectId });
}

function useTaskMutationsReal() {
  const completeTask = useCompleteTask();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();

  return {
    complete: (taskId: number) => completeTask.mutate(taskId),
    reopen: (taskId: number) => updateTask.mutate({ id: taskId, status: 'open' }),
    create: (
      body: {
        title: string;
        organization_id: number;
        project_id: number;
        due_date: string | null;
      },
      options?: { onSuccess?: () => void },
    ) => createTask.mutate(body, options),
    isCreating: createTask.isPending,
  };
}

function formatCompletedAt(value: string | null): string {
  if (!value) return 'Completed';
  return `Completed ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))}`;
}

export function ProjectNextStepsTile({
  projectId,
  orgId,
  _useTasks,
  _useTaskMutations,
}: ProjectNextStepsTileProps) {
  const useTasks = _useTasks ?? useTasksForTile;
  const useTaskMutations = _useTaskMutations ?? useTaskMutationsReal;
  const { data: tasks, isLoading } = useTasks({ projectId });
  const taskMutations = useTaskMutations();

  const [adding, setAdding] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [dueDateVal, setDueDateVal] = useState('');

  const resetForm = useCallback(() => {
    setTitleVal('');
    setDueDateVal('');
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    setAdding(false);
  }, [resetForm]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const title = titleVal.trim();
      if (!title) return;
      taskMutations.create(
        {
          title,
          organization_id: orgId,
          project_id: projectId,
          due_date: dueDateVal || null,
        },
        { onSuccess: () => { resetForm(); setAdding(false); } },
      );
    },
    [titleVal, dueDateVal, orgId, projectId, taskMutations, resetForm],
  );

  const allTasks = tasks ?? [];
  const openTasks = allTasks.filter((task) => task.status === 'open');
  const completedTasks = allTasks
    .filter((task) => task.status === 'done')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  return (
    <Tile
      title="Next Steps"
      count={isLoading ? '…' : openTasks.length || undefined}
      titleAction={
        adding ? undefined : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add next step"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: 'none',
              padding: '2px 4px',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
            }}
          >
            <Plus size={11} strokeWidth={1.5} aria-hidden="true" />
            Add step
          </button>
        )
      }
    >
      {adding && (
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: openTasks.length > 0 ? 14 : 0 }}
        >
          <input
            type="text"
            autoFocus
            autoComplete="off"
            placeholder="What needs to happen?"
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            style={inputCss}
            aria-label="Next step title"
          />
          <input
            type="date"
            value={dueDateVal}
            onChange={(e) => setDueDateVal(e.target.value)}
            style={inputCss}
            aria-label="Due date (optional)"
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: '4px 10px',
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
            <button
              type="submit"
              disabled={taskMutations.isCreating}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: 'none',
                borderRadius: 4,
                background: 'var(--accent)',
                color: '#fff',
                cursor: taskMutations.isCreating ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              Save
            </button>
          </div>
        </form>
      )}

      {isLoading && <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>}

      {!isLoading && openTasks.length === 0 && !adding && (
        <TileEmptyState copy={completedTasks.length > 0 ? 'No open next steps.' : 'No next steps yet.'} ariaLive />
      )}

      {openTasks.length > 0 && (
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {openTasks.map((task) => (
            <li
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '6px 0',
                borderBottom: '1px solid var(--rule)',
              }}
            >
              <button
                type="button"
                aria-label={`Mark complete: ${task.title}`}
                onClick={() => taskMutations.complete(task.id)}
                style={{
                  flexShrink: 0,
                  marginTop: 2,
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  border: '1px solid var(--rule)',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  color: 'var(--ink-3)',
                }}
              >
                <Check size={10} strokeWidth={2} aria-hidden="true" />
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--ink-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.title}
                </div>
                {task.due_date && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    Due {task.due_date}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {completedTasks.length > 0 && (
        <section
          aria-label="Completed next steps"
          style={{ marginTop: openTasks.length > 0 ? 10 : 0 }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: 0,
              marginBottom: 4,
            }}
          >
            Completed
          </div>
          <ul
            role="list"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {completedTasks.map((task) => (
              <li
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 0',
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--ink-3)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: 'line-through',
                    }}
                  >
                    {task.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    {formatCompletedAt(task.completed_at)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Reopen: ${task.title}`}
                  onClick={() => taskMutations.reopen(task.id)}
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    border: '1px solid var(--rule)',
                    background: 'transparent',
                    color: 'var(--ink-3)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                  title="Reopen"
                >
                  <RotateCcw size={12} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Tile>
  );
}
