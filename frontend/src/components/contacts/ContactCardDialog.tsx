import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Mail, MessageSquare, PhoneCall, Save, X } from 'lucide-react';
import { useUpdateContact } from '../../api/useContacts';
import { useTasks } from '../../api/useTasks';
import { TaskEditDialog } from '../tasks/TaskEditDialog';
import type { Contact, Task } from '../../types';

interface ContactCardDialogProps {
  contact: Contact;
  organizationName?: string;
  onSaved?: (contact: Contact) => void;
  onClose: () => void;
}

const fieldStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--rule)',
  borderRadius: 4,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 13,
  padding: '7px 9px',
  boxSizing: 'border-box',
};

function buttonStyle(disabled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid var(--rule)',
    borderRadius: 5,
    background: 'var(--bg)',
    color: disabled ? 'var(--ink-3)' : 'var(--ink-2)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--body)',
    fontSize: 12,
    padding: '6px 10px',
  };
}

function textInput(label: string, value: string, onChange: (value: string) => void, type = 'text') {
  return (
    <label style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--ink-3)' }}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={fieldStyle}
      />
    </label>
  );
}

export function ContactCardDialog({ contact, organizationName, onSaved, onClose }: ContactCardDialogProps) {
  const updateContact = useUpdateContact();
  const questionsQuery = useTasks({
    orgId: contact.organization_id,
    contactId: contact.id > 0 ? contact.id : undefined,
    kind: 'question',
    status: 'open',
  });
  const [name, setName] = useState(contact.name);
  const [title, setTitle] = useState(contact.title ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [role, setRole] = useState(contact.role ?? '');
  const [details, setDetails] = useState(contact.details ?? '');
  const [savedContact, setSavedContact] = useState(contact);
  const [savedDetails, setSavedDetails] = useState(contact.details ?? '');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setName(contact.name);
    setTitle(contact.title ?? '');
    setEmail(contact.email ?? '');
    setPhone(contact.phone ?? '');
    setRole(contact.role ?? '');
    setDetails(contact.details ?? '');
    setSavedContact(contact);
    setSavedDetails(contact.details ?? '');
    setFormError(null);
  }, [contact]);

  const questions = useMemo(() => questionsQuery.data ?? [], [questionsQuery.data]);
  const isDirty =
    name !== savedContact.name ||
    title !== (savedContact.title ?? '') ||
    email !== (savedContact.email ?? '') ||
    phone !== (savedContact.phone ?? '') ||
    role !== (savedContact.role ?? '') ||
    details !== savedDetails;
  const canSave = contact.id > 0 && isDirty && name.trim().length > 0 && !updateContact.isPending;

  const saveContact = () => {
    const nextEmail = email.trim();
    if (!name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setFormError('Email must be a valid address.');
      return;
    }
    if (!canSave) return;
    updateContact.mutate({
      id: contact.id,
      name: name.trim(),
      title: title.trim() || null,
      email: nextEmail || null,
      phone: phone.trim() || null,
      role: role.trim() || null,
      details: details.trim() || null,
    }, {
      onSuccess: (updated) => {
        setName(updated.name);
        setTitle(updated.title ?? '');
        setEmail(updated.email ?? '');
        setPhone(updated.phone ?? '');
        setRole(updated.role ?? '');
        setDetails(updated.details ?? '');
        setSavedContact(updated);
        setSavedDetails(updated.details ?? '');
        setFormError(null);
        onSaved?.(updated);
      },
    });
  };

  const actionEmail = email.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-card-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        background: 'rgba(6, 9, 13, 0.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: 'min(760px, 100%)',
          maxHeight: '88vh',
          overflow: 'auto',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          background: 'var(--bg)',
          padding: 22,
          display: 'grid',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 5px', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Contact card
            </p>
            <h2 id="contact-card-title" style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 26, fontWeight: 500 }}>
              {name || contact.name}
            </h2>
            <p style={{ margin: '5px 0 0', color: 'var(--ink-3)', fontSize: 13 }}>
              {organizationName ?? `Organization #${contact.organization_id}`}
            </p>
          </div>
          <button type="button" aria-label="Close contact card" onClick={onClose} style={{ ...buttonStyle(), padding: 6 }}>
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.9fr) minmax(280px, 1fr)', gap: 18 }}>
          <section style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <div style={{ display: 'grid', gap: 9 }}>
              {textInput('Name', name, setName)}
              {textInput('Title', title, setTitle)}
              {textInput('Email', email, setEmail, 'email')}
              {textInput('Phone', phone, setPhone, 'tel')}
              <label style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--ink-3)' }}>
                Role
                <select value={role} onChange={(event) => setRole(event.target.value)} style={fieldStyle}>
                  <option value="">No role</option>
                  <option value="account">Account</option>
                  <option value="channel">Channel</option>
                </select>
              </label>
              <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 12 }}>
                Created {contact.created_at.slice(0, 10)}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {actionEmail && (
                <>
                  <a href={`mailto:${actionEmail}`} aria-label={`Email ${name || contact.name}`} style={buttonStyle()}>
                    <Mail size={13} aria-hidden="true" />
                    Email
                  </a>
                  <a href={`msteams://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(actionEmail)}`} aria-label={`Teams ${name || contact.name}`} style={buttonStyle()}>
                    <MessageSquare size={13} aria-hidden="true" />
                    Teams
                  </a>
                  <a href={`msteams://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(actionEmail)}`} aria-label={`Call ${name || contact.name}`} style={buttonStyle()}>
                    <PhoneCall size={13} aria-hidden="true" />
                    Call
                  </a>
                </>
              )}
            </div>

            <section style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--ink-1)' }}>
                Open questions
              </h3>
              {questions.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>No open questions for this contact.</p>
              ) : (
                <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>
                  {questions.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => setEditingTask(task)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--ink-1)',
                          cursor: 'pointer',
                          fontFamily: 'var(--body)',
                          fontSize: 13,
                          fontWeight: 600,
                          padding: 0,
                          textAlign: 'left',
                        }}
                      >
                        {task.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>

          <section style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            <label htmlFor="contact-card-details" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Details and notes
            </label>
            <textarea
              id="contact-card-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              rows={13}
              placeholder="Notes, preferences, context, relationship map, follow-up reminders..."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.45 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span role={formError ? 'alert' : undefined} style={{ color: formError ? 'var(--accent)' : 'var(--ink-3)', fontSize: 12 }}>
                {formError ?? (updateContact.isSuccess && !isDirty ? 'Saved' : '')}
              </span>
              <button type="button" onClick={saveContact} disabled={!canSave} style={buttonStyle(!canSave)}>
                <Save size={13} aria-hidden="true" />
                Save contact
              </button>
            </div>
          </section>
        </div>
      </section>
      {editingTask && <TaskEditDialog task={editingTask} onClose={() => setEditingTask(null)} />}
    </div>
  );
}
