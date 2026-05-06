import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { CheckCircle2, Mail, MessageSquare, PhoneCall, Plus, RefreshCw, Search, Sparkles, Trash2, UserPlus, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import {
  useAllContacts,
  useCreateContact,
  useDeleteContact,
  useEnrichContact,
  useImportWwtDirectoryContact,
  useSearchWwtDirectory,
  useUpdateContact,
} from '../api/useContacts';
import { useOrganizations } from '../api/useOrganizations';
import { useTasks } from '../api/useTasks';
import { ContactCardDialog } from '../components/contacts/ContactCardDialog';
import { TaskEditDialog } from '../components/tasks/TaskEditDialog';
import type { Contact, ContactEnrichmentResponse, Task } from '../types';

const fieldStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--rule)',
  borderRadius: 4,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 12,
  padding: '6px 8px',
  boxSizing: 'border-box',
};

const tableCell: CSSProperties = {
  padding: '9px 10px',
  borderBottom: '1px solid var(--rule)',
  verticalAlign: 'middle',
  fontSize: 13,
};

function actionButtonStyle(disabled = false): CSSProperties {
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

interface ContactFormProps {
  orgs: Array<{ id: number; name: string }>;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (input: { organization_id: number; name: string; title: string; email: string; phone: string; role: string }) => void;
}

function ContactForm({ orgs, isSaving, onCancel, onSubmit }: ContactFormProps) {
  const [organizationId, setOrganizationId] = useState(orgs[0]?.id ? String(orgs[0].id) : '');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');

  const canSubmit = Boolean(organizationId) && name.trim().length > 0 && !isSaving;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      organization_id: Number(organizationId),
      name: name.trim(),
      title: title.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role: role.trim(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'grid',
        gridTemplateColumns: '220px minmax(180px, 1fr) minmax(160px, 1fr) minmax(180px, 1fr) 150px auto auto',
        gap: 8,
        alignItems: 'end',
        marginBottom: 14,
        padding: 12,
        border: '1px solid var(--rule)',
        borderRadius: 6,
        background: 'var(--bg-2)',
      }}
    >
      <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>
        Organization
        <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} style={fieldStyle}>
          {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus style={fieldStyle} />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} style={fieldStyle} />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} style={fieldStyle} />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>
        Phone
        <input value={phone} onChange={(event) => setPhone(event.target.value)} style={fieldStyle} />
      </label>
      <button type="submit" disabled={!canSubmit} style={actionButtonStyle(!canSubmit)}>
        Save
      </button>
      <button type="button" onClick={onCancel} style={actionButtonStyle()}>
        Cancel
      </button>
      <label style={{ display: 'none' }}>
        Role
        <input value={role} onChange={(event) => setRole(event.target.value)} />
      </label>
    </form>
  );
}

interface EnrichmentDialogProps {
  contact: Contact;
  result: ContactEnrichmentResponse;
  isSaving: boolean;
  onApply: () => void;
  onClose: () => void;
}

function EnrichmentDialog({ contact, result, isSaving, onApply, onClose }: EnrichmentDialogProps) {
  const s = result.suggestions;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-enrich-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(6, 9, 13, 0.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: 'min(640px, 100%)',
          maxHeight: '85vh',
          overflow: 'auto',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          background: 'var(--bg)',
          padding: 22,
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 id="contact-enrich-title" style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500 }}>
              M365 suggestions
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--ink-3)', fontSize: 13 }}>
              Review before applying to {contact.name}.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ ...actionButtonStyle(), padding: 6 }}>
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '120px 1fr', gap: '7px 12px', fontSize: 13 }}>
          <dt style={{ color: 'var(--ink-3)' }}>Name</dt><dd style={{ margin: 0 }}>{s.name ?? '-'}</dd>
          <dt style={{ color: 'var(--ink-3)' }}>Title</dt><dd style={{ margin: 0 }}>{s.title ?? '-'}</dd>
          <dt style={{ color: 'var(--ink-3)' }}>Email</dt><dd style={{ margin: 0 }}>{s.email ?? '-'}</dd>
          <dt style={{ color: 'var(--ink-3)' }}>Phone</dt><dd style={{ margin: 0 }}>{s.phone ?? '-'}</dd>
          <dt style={{ color: 'var(--ink-3)' }}>Confidence</dt><dd style={{ margin: 0 }}>{Math.round(s.confidence * 100)}%</dd>
        </dl>

        {s.evidence.length > 0 && (
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Evidence
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.5 }}>
              {s.evidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}

        {result.notes.length > 0 && (
          <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.5 }}>
            {result.notes.join(' ')}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={actionButtonStyle()}>Cancel</button>
          <button type="button" onClick={onApply} disabled={isSaving} style={actionButtonStyle(isSaving)}>
            Apply suggestions
          </button>
        </div>
      </section>
    </div>
  );
}

function WwtDirectoryTile() {
  const [query, setQuery] = useState('');
  const contactsQuery = useAllContacts();
  const searchDirectory = useSearchWwtDirectory();
  const importContact = useImportWwtDirectoryContact();
  const results = searchDirectory.data ?? [];
  const savedWwtContacts = useMemo(
    () => (contactsQuery.data ?? [])
      .filter((contact) => contact.role === 'wwt_resource' || contact.email?.toLowerCase().endsWith('@wwt.com'))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [contactsQuery.data],
  );
  const savedEmails = useMemo(
    () => new Set(savedWwtContacts.flatMap((contact) => (contact.email ? [contact.email.toLowerCase()] : []))),
    [savedWwtContacts],
  );

  const runSearch = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    searchDirectory.mutate(trimmed);
  };

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--surface)', padding: 16, marginBottom: 16, width: 'min(780px, 100%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500 }}>WWT directory</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--ink-3)', fontSize: 13 }}>
            Pull WWT users from the Classic Outlook address book into local contacts.
          </p>
        </div>
      </div>
      <form onSubmit={runSearch} style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) auto', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          aria-label="Search WWT directory"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, email, title, office, or multi-word search"
          style={fieldStyle}
        />
        <button type="submit" disabled={query.trim().length < 2 || searchDirectory.isPending} style={actionButtonStyle(query.trim().length < 2 || searchDirectory.isPending)}>
          <Search size={13} aria-hidden="true" />
          {searchDirectory.isPending ? 'Searching...' : 'Search'}
        </button>
      </form>
      {searchDirectory.isError && (
        <p role="alert" style={{ margin: '0 0 10px', color: 'var(--accent)', fontSize: 13 }}>
          {searchDirectory.error.message}
        </p>
      )}
      {results.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 14 }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontFamily: 'var(--body)' }}>
            <thead>
              <tr>
                <th style={{ ...tableCell, textAlign: 'left' }}>Name</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Title</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Email</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Office</th>
                <th style={{ ...tableCell, width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {results.map((result) => {
                const isSaved = savedEmails.has(result.email.toLowerCase());
                const isBusy = importContact.isPending && importContact.variables?.email === result.email;
                return (
                  <tr key={result.email}>
                    <td style={tableCell}>{result.name}</td>
                    <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{result.title ?? '-'}</td>
                    <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{result.email}</td>
                    <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{result.office ?? '-'}</td>
                    <td style={tableCell}>
                      <button
                        type="button"
                        onClick={() => importContact.mutate(result)}
                        disabled={isSaved || importContact.isPending}
                        style={actionButtonStyle(isSaved || importContact.isPending)}
                      >
                        {isSaved ? <CheckCircle2 size={13} aria-hidden="true" /> : <UserPlus size={13} aria-hidden="true" />}
                        {isSaved ? 'Saved' : isBusy ? 'Adding...' : 'Add'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Saved WWT contacts</h3>
          <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{savedWwtContacts.length} local</span>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontFamily: 'var(--body)' }}>
            <thead>
              <tr>
                <th style={{ ...tableCell, textAlign: 'left' }}>Name</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Title</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Email</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Phone</th>
              </tr>
            </thead>
            <tbody>
              {contactsQuery.isLoading && (
                <tr><td colSpan={4} style={{ ...tableCell, color: 'var(--ink-3)' }}>Loading local directory...</td></tr>
              )}
              {!contactsQuery.isLoading && savedWwtContacts.length === 0 && (
                <tr><td colSpan={4} style={{ ...tableCell, color: 'var(--ink-3)' }}>No WWT contacts saved locally yet.</td></tr>
              )}
              {savedWwtContacts.map((contact) => (
                <tr key={contact.id}>
                  <td style={tableCell}>{contact.name}</td>
                  <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{contact.title ?? '-'}</td>
                  <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{contact.email ?? '-'}</td>
                  <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{contact.phone ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function ContactsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [enrichment, setEnrichment] = useState<{ contact: Contact; result: ContactEnrichmentResponse } | null>(null);
  const [enrichingId, setEnrichingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [cardContact, setCardContact] = useState<Contact | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const contactsQuery = useAllContacts();
  const customersQuery = useOrganizations('customer');
  const oemsQuery = useOrganizations('oem');
  const allQuestionsQuery = useTasks({ kind: 'question', status: 'open' });
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const enrichContact = useEnrichContact();

  const orgs = useMemo(() => [...(customersQuery.data ?? []), ...(oemsQuery.data ?? [])], [customersQuery.data, oemsQuery.data]);
  const orgMap = useMemo(() => new Map(orgs.map((org) => [org.id, org.name])), [orgs]);
  const contactList = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (contactsQuery.data ?? []).filter((contact) => {
      if (!needle) return true;
      return [contact.name, contact.title, contact.email, contact.phone, orgMap.get(contact.organization_id)]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [contactsQuery.data, orgMap, query]);
  const selectedContactId = Number(searchParams.get('contact')) || null;
  const selectedContact = useMemo(
    () => (contactsQuery.data ?? []).find((contact) => contact.id === selectedContactId) ?? null,
    [contactsQuery.data, selectedContactId],
  );
  useEffect(() => {
    if (selectedContact && cardContact === null) setCardContact(selectedContact);
  }, [cardContact, selectedContact]);
  const questionsByContact = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const task of allQuestionsQuery.data ?? []) {
      if (task.contact_id === null) continue;
      const existing = map.get(task.contact_id) ?? [];
      existing.push(task);
      map.set(task.contact_id, existing);
    }
    return map;
  }, [allQuestionsQuery.data]);
  const selectedQuestions = selectedContact ? questionsByContact.get(selectedContact.id) ?? [] : [];

  const handleEnrich = (contact: Contact) => {
    setEnrichingId(contact.id);
    enrichContact.mutate(contact.id, {
      onSuccess: (result) => setEnrichment({ contact, result }),
      onSettled: () => setEnrichingId(null),
    });
  };

  const applyEnrichment = () => {
    if (!enrichment) return;
    const { contact, result } = enrichment;
    const s = result.suggestions;
    updateContact.mutate({
      id: contact.id,
      name: s.name?.trim() || contact.name,
      title: s.title?.trim() || contact.title,
      email: s.email?.trim() || contact.email,
      phone: s.phone?.trim() || contact.phone,
    }, { onSuccess: () => setEnrichment(null) });
  };
  const selectContact = (contactId: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (contactId === null) next.delete('contact');
    else next.set('contact', String(contactId));
    setSearchParams(next);
  };
  const handleDelete = (contact: Contact) => {
    deleteContact.mutate(
      { id: contact.id, orgId: contact.organization_id },
      {
        onSuccess: () => {
          setConfirmDeleteId(null);
          if (cardContact?.id === contact.id) setCardContact(null);
          if (selectedContactId === contact.id) selectContact(null);
        },
      },
    );
  };

  return (
    <div>
      <PageHeader
        eyebrow="Contacts"
        title="Contacts"
        subtitle={`${contactList.length} people in MasterControl`}
        actions={
          <button type="button" onClick={() => setAdding(true)} style={actionButtonStyle()}>
            <Plus size={14} strokeWidth={1.7} aria-hidden="true" />
            Add contact
          </button>
        }
      />

      <WwtDirectoryTile />

      <section style={{ border: '1px solid var(--rule)', borderRadius: 8, background: 'var(--surface)', padding: 16 }}>
        {adding && (
          <ContactForm
            orgs={orgs}
            isSaving={createContact.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(input) => {
              createContact.mutate({
                organization_id: input.organization_id,
                name: input.name,
                title: input.title || null,
                email: input.email || null,
                phone: input.phone || null,
                role: input.role || null,
              }, { onSuccess: () => setAdding(false) });
            }}
          />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input
            aria-label="Filter contacts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, title, email, organization"
            style={{ ...fieldStyle, maxWidth: 420 }}
          />
          {contactsQuery.isError && (
            <button type="button" onClick={() => void contactsQuery.refetch()} style={actionButtonStyle()}>
              <RefreshCw size={13} aria-hidden="true" />
              Retry
            </button>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 1040, borderCollapse: 'collapse', fontFamily: 'var(--body)' }}>
            <thead>
              <tr>
                <th style={{ ...tableCell, textAlign: 'left' }}>Name</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Organization</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Title</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Email</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Phone</th>
                <th style={{ ...tableCell, textAlign: 'left' }}>Open questions</th>
                <th style={{ ...tableCell, textAlign: 'left', width: 310 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contactsQuery.isLoading && (
                <tr><td colSpan={7} style={{ ...tableCell, color: 'var(--ink-3)' }}>Loading...</td></tr>
              )}
              {!contactsQuery.isLoading && contactList.length === 0 && (
                <tr><td colSpan={7} style={{ ...tableCell, color: 'var(--ink-3)' }}>No contacts match.</td></tr>
              )}
              {contactList.map((contact) => (
                <tr key={contact.id}>
                  <td style={tableCell}>
                    <button
                      type="button"
                      onClick={() => setCardContact(contact)}
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
                      {contact.name}
                    </button>
                  </td>
                  <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{orgMap.get(contact.organization_id) ?? `Org #${contact.organization_id}`}</td>
                  <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{contact.title ?? '-'}</td>
                  <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{contact.email ?? '-'}</td>
                  <td style={{ ...tableCell, color: 'var(--ink-2)' }}>{contact.phone ?? '-'}</td>
                  <td style={{ ...tableCell, color: 'var(--ink-2)' }}>
                    <button type="button" onClick={() => selectContact(contact.id)} style={actionButtonStyle()}>
                      {questionsByContact.get(contact.id)?.length ?? 0}
                    </button>
                  </td>
                  <td style={tableCell}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {contact.email && (
                        <>
                          <a href={`mailto:${contact.email}`} aria-label={`Email ${contact.name}`} style={actionButtonStyle()}>
                            <Mail size={13} aria-hidden="true" />
                          </a>
                          <a href={`msteams://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(contact.email)}`} aria-label={`Teams ${contact.name}`} style={actionButtonStyle()}>
                            <MessageSquare size={13} aria-hidden="true" />
                          </a>
                          <a href={`msteams://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(contact.email)}`} aria-label={`Call ${contact.name}`} style={actionButtonStyle()}>
                            <PhoneCall size={13} aria-hidden="true" />
                          </a>
                        </>
                      )}
                      <button type="button" onClick={() => handleEnrich(contact)} disabled={enrichingId === contact.id} style={actionButtonStyle(enrichingId === contact.id)}>
                        <Sparkles size={13} aria-hidden="true" />
                        {enrichingId === contact.id ? 'Checking...' : 'M365'}
                      </button>
                      {confirmDeleteId === contact.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDelete(contact)}
                            disabled={deleteContact.isPending}
                            style={{ ...actionButtonStyle(deleteContact.isPending), color: 'var(--accent)', borderColor: 'var(--accent)' }}
                          >
                            Delete
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} style={actionButtonStyle()}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmDeleteId(contact.id)} aria-label={`Delete ${contact.name}`} style={actionButtonStyle()}>
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedContact && (
          <section style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500 }}>
                  Open questions for {selectedContact.name}
                </h2>
                <p style={{ margin: '4px 0 0', color: 'var(--ink-3)', fontSize: 13 }}>
                  {selectedQuestions.length} open question{selectedQuestions.length === 1 ? '' : 's'}
                </p>
              </div>
              <button type="button" onClick={() => selectContact(null)} style={actionButtonStyle()}>
                Close
              </button>
            </div>
            {selectedQuestions.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>No open questions for this contact.</p>
            ) : (
              <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {selectedQuestions.map((task) => (
                  <li key={task.id} style={{ border: '1px solid var(--rule)', borderRadius: 6, padding: 10, background: 'var(--bg-2)' }}>
                    <button
                      type="button"
                      onClick={() => setEditingTask(task)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--ink-1)',
                        cursor: 'pointer',
                        fontFamily: 'var(--body)',
                        fontSize: 14,
                        fontWeight: 600,
                        padding: 0,
                        textAlign: 'left',
                      }}
                    >
                      {task.title}
                    </button>
                    {task.details && <p style={{ margin: '5px 0 0', color: 'var(--ink-3)', fontSize: 13 }}>{task.details}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </section>

      {enrichContact.isError && (
        <p role="alert" style={{ color: 'var(--accent)', fontSize: 13 }}>
          {enrichContact.error.message}
        </p>
      )}

      {enrichment && (
        <EnrichmentDialog
          contact={enrichment.contact}
          result={enrichment.result}
          isSaving={updateContact.isPending}
          onApply={applyEnrichment}
          onClose={() => setEnrichment(null)}
        />
      )}
      {cardContact && (
        <ContactCardDialog
          contact={cardContact}
          organizationName={orgMap.get(cardContact.organization_id)}
          onSaved={setCardContact}
          onClose={() => {
            const closingId = cardContact.id;
            setCardContact(null);
            if (selectedContactId === closingId) selectContact(null);
          }}
        />
      )}
      {editingTask && <TaskEditDialog task={editingTask} onClose={() => setEditingTask(null)} />}
    </div>
  );
}
