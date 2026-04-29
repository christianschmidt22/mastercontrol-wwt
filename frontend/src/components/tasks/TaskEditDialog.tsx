import { useEffect, useState, type CSSProperties } from 'react';
import { Trash2, X } from 'lucide-react';
import { useDeleteTask, useUpdateTask } from '../../api/useTasks';
import type { Task, TaskStatus } from '../../types';

interface TaskEditDialogProps {
  task: Task;
  onClose: () => void;
}

const STATUSES: TaskStatus[] = ['open', 'done', 'snoozed'];

const labelStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--body)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  marginBottom: 6,
};

const fieldStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--rule)',
  borderRadius: 6,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 14,
  lineHeight: 1.5,
  padding: '8px 10px',
  outline: 'none',
  boxSizing: 'border-box',
};

const buttonStyle: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 12,
  fontWeight: 500,
  padding: '7px 12px',
  borderRadius: 6,
  border: '1px solid var(--rule)',
  background: 'var(--bg)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
};

export function TaskEditDialog({ task, onClose }: TaskEditDialogProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  const [status, setStatus] = useState<TaskStatus>(task.status);

  useEffect(() => {
    setTitle(task.title);
    setDueDate(task.due_date ?? '');
    setStatus(task.status);
  }, [task.id, task.title, task.due_date, task.status]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const trimmedTitle = title.trim();
  const titleValid = trimmedTitle.length > 0;
  const isDirty =
    trimmedTitle !== task.title ||
    (dueDate || null) !== task.due_date ||
    status !== task.status;

  const handleSave = () => {
    if (!titleValid) return;
    updateTask.mutate(
      {
        id: task.id,
        title: trimmedTitle,
        due_date: dueDate || null,
        status,
      },
      { onSuccess: () => onClose() },
    );
  };

  const handleDelete = () => {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    deleteTask.mutate(task.id, { onSuccess: () => onClose() });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-edit-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(6, 9, 13, 0.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: 'min(520px, 100%)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          background: 'var(--bg)',
          padding: 22,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.32)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2
            id="task-edit-title"
            style={{
              margin: 0,
              fontFamily: 'var(--display)',
              fontSize: 20,
              fontWeight: 500,
              color: 'var(--ink-1)',
            }}
          >
            Edit task
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-3)',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div>
          <label style={labelStyle} htmlFor="task-edit-title-input">Title</label>
          <input
            id="task-edit-title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            aria-invalid={!titleValid}
            style={{
              ...fieldStyle,
              borderColor: titleValid ? 'var(--rule)' : 'var(--accent)',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="task-edit-due">Due date</label>
            <input
              id="task-edit-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="task-edit-status">Status</label>
            <select
              id="task-edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              style={fieldStyle}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s} style={{ background: 'var(--bg)', color: 'var(--ink-1)' }}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteTask.isPending}
            style={{
              ...buttonStyle,
              color: 'var(--accent)',
              borderColor: 'var(--rule)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
            Delete
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={buttonStyle}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || !titleValid || updateTask.isPending}
              style={{
                ...buttonStyle,
                background: isDirty && titleValid ? 'var(--bg-2)' : 'var(--bg)',
                color: isDirty && titleValid ? 'var(--ink-1)' : 'var(--ink-3)',
                cursor: isDirty && titleValid && !updateTask.isPending ? 'pointer' : 'not-allowed',
              }}
            >
              {updateTask.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
