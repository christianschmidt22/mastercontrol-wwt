import { useCallback, useId, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Tile } from '../tiles/Tile';
import { TileEmptyState } from '../tiles/TileEmptyState';
import {
  type BacklogItem,
  useBacklogItems,
  useCompleteBacklogItem,
  useCreateBacklogItem,
} from '../../api/useBacklogItems';
import { BacklogEditDialog } from './BacklogEditDialog';

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function formatDue(due: string | null): string {
  if (!due) return '';
  const d = new Date(due);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

/**
 * MasterControl-meta backlog tile — features / changes you want to make to
 * this app itself. Same shape as the Tasks tile (open + snoozed shown,
 * checkbox completes, click row opens the edit dialog).
 */
export function BacklogTile() {
  const { data, isLoading } = useBacklogItems();
  const create = useCreateBacklogItem();
  const complete = useCompleteBacklogItem();

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [editing, setEditing] = useState<BacklogItem | null>(null);

  const formId = useId();
  const titleId = `${formId}-title`;
  const dueId = `${formId}-due`;

  const items = (data ?? []).filter((i) => i.status === 'open' || i.status === 'snoozed');

  const handleAdd = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const title = newTitle.trim();
      if (!title) return;
      create.mutate(
        { title, due_date: newDue || null },
        {
          onSuccess: () => {
            setNewTitle('');
            setNewDue('');
            setAdding(false);
          },
        },
      );
    },
    [create, newTitle, newDue],
  );

  return (
    <Tile title="Backlog" count={isLoading ? '…' : items.length || undefined}>
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && items.length === 0 && !adding && (
        <TileEmptyState copy="No backlog items yet." ariaLive />
      )}

      {items.length > 0 && (
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
          {items.map((item) => {
            const overdue = isOverdue(item.due_date);
            const checkId = `backlog-${item.id}`;
            return (
              <li
                key={item.id}
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
                  aria-label={`Mark complete: ${item.title}`}
                  defaultChecked={false}
                  onChange={() => complete.mutate(item.id)}
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
                  onClick={() => setEditing(item)}
                  title={item.notes ?? item.title}
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
                  {item.title}
                </button>
                {item.due_date && (
                  <time
                    dateTime={item.due_date}
                    style={{
                      fontSize: 11,
                      color: overdue ? 'var(--accent)' : 'var(--ink-3)',
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {formatDue(item.due_date)}
                  </time>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form
          onSubmit={handleAdd}
          style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <label
            htmlFor={titleId}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
            }}
          >
            New backlog item title
          </label>
          <input
            id={titleId}
            type="text"
            autoComplete="off"
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Feature or change…"
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
              htmlFor={dueId}
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
              id={dueId}
              type="date"
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
              disabled={create.isPending}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: '1px solid var(--rule)',
                borderRadius: 4,
                background: 'var(--bg-2)',
                color: 'var(--ink-1)',
                cursor: create.isPending ? 'wait' : 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
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
          onClick={() => setAdding(true)}
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
          Add backlog item
        </button>
      )}

      {editing && <BacklogEditDialog item={editing} onClose={() => setEditing(null)} />}
    </Tile>
  );
}
