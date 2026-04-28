import { useState, useCallback, type FormEvent, type CSSProperties } from 'react';
import { Check, Plus } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import { useTasks, useCompleteTask, useCreateTask } from '../../../api/useTasks';

interface ProjectNextStepsTileProps {
  projectId: number;
  orgId: number;
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

export function ProjectNextStepsTile({ projectId, orgId }: ProjectNextStepsTileProps) {
  const { data: tasks, isLoading } = useTasks({ projectId, status: 'open' });
  const completeTask = useCompleteTask();
  const createTask = useCreateTask();

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
      createTask.mutate(
        {
          title,
          organization_id: orgId,
          project_id: projectId,
          due_date: dueDateVal || null,
        },
        { onSuccess: () => { resetForm(); setAdding(false); } },
      );
    },
    [titleVal, dueDateVal, orgId, projectId, createTask, resetForm],
  );

  const openTasks = tasks ?? [];

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
              disabled={createTask.isPending}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: 'none',
                borderRadius: 4,
                background: 'var(--accent)',
                color: '#fff',
                cursor: createTask.isPending ? 'not-allowed' : 'pointer',
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
        <TileEmptyState copy="No open next steps." ariaLive />
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
                aria-label={`Complete: ${task.title}`}
                onClick={() => completeTask.mutate(task.id)}
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
    </Tile>
  );
}
