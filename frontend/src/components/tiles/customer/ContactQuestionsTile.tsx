import { useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useContacts } from '../../../api/useContacts';
import { useCreateTask, useTasks } from '../../../api/useTasks';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import { TaskEditDialog } from '../../tasks/TaskEditDialog';
import type { Task } from '../../../types';

interface ContactQuestionsTileProps {
  orgId: number;
  contactName: string;
}

function formatDue(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export function ContactQuestionsTile({ orgId, contactName }: ContactQuestionsTileProps) {
  const contactsQuery = useContacts(orgId);
  const createTask = useCreateTask();
  const [adding, setAdding] = useState(false);
  const [question, setQuestion] = useState('');
  const [details, setDetails] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const contact = useMemo(() => {
    const needle = contactName.toLowerCase();
    return (contactsQuery.data ?? []).find((candidate) => candidate.name.toLowerCase().includes(needle));
  }, [contactName, contactsQuery.data]);

  const questionsQuery = useTasks({
    orgId,
    contactId: contact?.id,
    kind: 'question',
    status: 'open',
  });

  const questions = contact ? (questionsQuery.data ?? []) : [];

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const title = question.trim();
    if (!title || !contact) return;
    createTask.mutate({
      title,
      details: details.trim() || null,
      organization_id: orgId,
      contact_id: contact.id,
      due_date: dueDate || null,
      kind: 'question',
      status: 'open',
    }, {
      onSuccess: () => {
        setQuestion('');
        setDetails('');
        setDueDate('');
        setAdding(false);
      },
    });
  };

  return (
    <Tile
      title={contact ? (
        <Link to={`/contacts?contact=${contact.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
          Questions for {contactName}
        </Link>
      ) : `Questions for ${contactName}`}
      count={contactsQuery.isLoading || questionsQuery.isLoading ? '...' : questions.length || undefined}
      titleAction={
        contact && !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: 'none',
              background: 'transparent',
              color: 'var(--ink-3)',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'var(--body)',
              padding: '2px 4px',
            }}
          >
            <Plus size={11} strokeWidth={1.5} aria-hidden="true" />
            Add
          </button>
        ) : undefined
      }
    >
      {!contact && !contactsQuery.isLoading && (
        <TileEmptyState copy={`Add ${contactName} to contacts to track questions here.`} ariaLive />
      )}

      {contact && adding && (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 7, marginBottom: 10 }}>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            autoFocus
            placeholder="Question to remember..."
            aria-label="Question"
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 4,
              padding: '5px 8px',
              fontSize: 13,
              background: 'transparent',
              color: 'var(--ink-1)',
              fontFamily: 'var(--body)',
            }}
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Context or talking points..."
            aria-label="Question details"
            rows={2}
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 4,
              padding: '5px 8px',
              fontSize: 12,
              background: 'transparent',
              color: 'var(--ink-1)',
              fontFamily: 'var(--body)',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-label="Question due date"
              style={{
                flex: 1,
                border: '1px solid var(--rule)',
                borderRadius: 4,
                padding: '4px 6px',
                fontSize: 12,
                background: 'transparent',
                color: 'var(--ink-2)',
                fontFamily: 'var(--body)',
              }}
            />
            <button type="submit" disabled={!question.trim() || createTask.isPending} style={{ border: '1px solid var(--rule)', borderRadius: 4, background: 'var(--bg-2)', color: 'var(--ink-1)', padding: '4px 10px', fontSize: 12 }}>
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} style={{ border: '1px solid var(--rule)', borderRadius: 4, background: 'transparent', color: 'var(--ink-2)', padding: '4px 8px', fontSize: 12 }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {contact && questions.length === 0 && !adding && (
        <TileEmptyState copy="No open questions." ariaLive />
      )}

      {questions.length > 0 && (
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {questions.map((item) => (
            <li key={item.id} style={{ borderBottom: '1px dotted var(--rule)', paddingBottom: 7 }}>
              <button
                type="button"
                onClick={() => setEditingTask(item)}
                style={{
                  display: 'block',
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  color: 'var(--ink-1)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'var(--body)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {item.title}
              </button>
              {item.details && (
                <p style={{ margin: '3px 0 0', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.4 }}>
                  {item.details}
                </p>
              )}
              {item.due_date && (
                <time dateTime={item.due_date} style={{ display: 'block', marginTop: 3, color: 'var(--ink-3)', fontSize: 11 }}>
                  {formatDue(item.due_date)}
                </time>
              )}
            </li>
          ))}
        </ul>
      )}

      {editingTask && <TaskEditDialog task={editingTask} onClose={() => setEditingTask(null)} />}
    </Tile>
  );
}
