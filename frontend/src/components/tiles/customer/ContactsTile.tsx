import { useState, useCallback, useId, type FormEvent, type CSSProperties } from 'react';
import { Mail, MessageSquare, PhoneCall, Plus, Trash2 } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import { ContactCardDialog } from '../../contacts/ContactCardDialog';
import type { Contact, ContactCreate } from '../../../types';
import {
  useContacts as useContactsReal,
  useCreateContact as useCreateContactReal,
  useDeleteContact as useDeleteContactReal,
} from '../../../api/useContacts';

// ── Hook interfaces — narrower than UseMutationResult for inject-ability ──────

interface UseContactsResult {
  data: Contact[] | undefined;
  isLoading: boolean;
}

interface UseCreateContactResult {
  mutate: (data: ContactCreate, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
}

interface UseDeleteContactResult {
  mutate: (data: { id: number; orgId: number }, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ContactsTileProps {
  orgId: number;
  /** Passed by CustomerPage — button now always lives in tile header, not gated here */
  editMode?: boolean;
  _useContacts?: (orgId: number) => UseContactsResult;
  _useCreateContact?: () => UseCreateContactResult;
  _useDeleteContact?: () => UseDeleteContactResult;
}

// ── Style constants ───────────────────────────────────────────────────────────

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

const fieldLabelCss: CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-2)',
  fontFamily: 'var(--body)',
};

/**
 * ContactsTile — compact contact list for the org.
 *
 * "+" header button expands an inline add-contact form.
 * Name (14px), title in --ink-2, email/phone behind hover.
 */
export function ContactsTile({ orgId, _useContacts, _useCreateContact, _useDeleteContact }: ContactsTileProps) {
  const useContacts = _useContacts ?? useContactsReal;
  const useCreateContact = _useCreateContact ?? useCreateContactReal;
  const useDeleteContact = _useDeleteContact ?? useDeleteContactReal;

  const { data: contacts, isLoading } = useContacts(orgId);
  const { mutate: createContact, isPending } = useCreateContact();
  const { mutate: deleteContact, isPending: isDeleting } = useDeleteContact();

  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);
  const [optimisticContacts, setOptimisticContacts] = useState<Contact[]>([]);

  // Form state
  const [nameVal, setNameVal] = useState('');
  const [titleVal, setTitleVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [phoneVal, setPhoneVal] = useState('');
  const [roleVal, setRoleVal] = useState<'account' | 'channel' | ''>('');
  const [formError, setFormError] = useState<string | null>(null);

  const id = useId();
  const nameId = `${id}-name`;
  const titleId = `${id}-title`;
  const emailId = `${id}-email`;
  const phoneId = `${id}-phone`;
  const roleId = `${id}-role`;

  const resetForm = useCallback(() => {
    setNameVal('');
    setTitleVal('');
    setEmailVal('');
    setPhoneVal('');
    setRoleVal('');
    setFormError(null);
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    setAdding(false);
  }, [resetForm]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const name = nameVal.trim();
      if (!name) {
        setFormError('Name is required.');
        return;
      }

      const optimistic: Contact = {
        id: -Date.now(),
        organization_id: orgId,
        name,
        title: titleVal.trim() || null,
        email: emailVal.trim() || null,
        phone: phoneVal.trim() || null,
        role: roleVal || null,
        details: null,
        created_at: new Date().toISOString(),
        assigned_org_ids: [],
      };
      setOptimisticContacts((prev) => [...prev, optimistic]);

      createContact(
        {
          organization_id: orgId,
          name,
          title: titleVal.trim() || null,
          email: emailVal.trim() || null,
          phone: phoneVal.trim() || null,
          role: roleVal || null,
        },
        { onSuccess: () => setOptimisticContacts([]) },
      );

      resetForm();
      setAdding(false);
    },
    [nameVal, titleVal, emailVal, phoneVal, roleVal, orgId, createContact, resetForm],
  );

  const handleDelete = useCallback(
    (contact: Contact) => {
      if (contact.id < 0) {
        setOptimisticContacts((prev) => prev.filter((item) => item.id !== contact.id));
        setConfirmDeleteId(null);
        return;
      }
      deleteContact(
        { id: contact.id, orgId },
        { onSuccess: () => setConfirmDeleteId(null) },
      );
    },
    [deleteContact, orgId],
  );

  const contactList = [...(contacts ?? []), ...optimisticContacts];

  return (
    <Tile
      title="Contacts"
      count={isLoading ? '…' : contactList.length || undefined}
      titleAction={
        adding ? undefined : (
          <button
            type="button"
            aria-label="Add contact"
            onClick={() => setAdding(true)}
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
            Add contact
          </button>
        )
      }
    >
      {/* ── Inline add form ───────────────────────────────────────────────── */}
      {adding && (
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: contactList.length > 0 ? 14 : 0,
          }}
        >
          {/* Validation error — cleared on next keystroke */}
          <div
            aria-live="polite"
            style={{ fontSize: 12, color: 'var(--accent)', minHeight: 16 }}
          >
            {formError ?? ''}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={nameId} style={fieldLabelCss}>
              Name
            </label>
            <input
              id={nameId}
              type="text"
              autoFocus
              autoComplete="off"
              value={nameVal}
              onChange={(e) => {
                setNameVal(e.target.value);
                setFormError(null);
              }}
              placeholder="Full name"
              style={inputCss}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={titleId} style={fieldLabelCss}>
              Title
            </label>
            <input
              id={titleId}
              type="text"
              autoComplete="off"
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              placeholder="e.g. CIO"
              style={inputCss}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={emailId} style={fieldLabelCss}>
              Email
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="off"
              value={emailVal}
              onChange={(e) => setEmailVal(e.target.value)}
              placeholder="name@example.com"
              style={inputCss}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={phoneId} style={fieldLabelCss}>
              Phone
            </label>
            <input
              id={phoneId}
              type="tel"
              autoComplete="off"
              value={phoneVal}
              onChange={(e) => setPhoneVal(e.target.value)}
              placeholder="+1 555 000 0000"
              style={inputCss}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={roleId} style={fieldLabelCss}>
              Role
            </label>
            <select
              id={roleId}
              value={roleVal}
              onChange={(e) =>
                setRoleVal(e.target.value as 'account' | 'channel' | '')
              }
              style={inputCss}
            >
              <option value="">— select —</option>
              <option value="account">Account</option>
              <option value="channel">Channel</option>
            </select>
          </div>

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
              disabled={isPending}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: 'none',
                borderRadius: 4,
                background: 'var(--accent)',
                color: '#fff',
                cursor: isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              Save
            </button>
          </div>
        </form>
      )}

      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && contactList.length === 0 && !adding && (
        <TileEmptyState
          copy="No contacts yet. Add the account team."
          ariaLive
        />
      )}

      {contactList.length > 0 && (
        <ul
          role="list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {contactList.map((contact) => (
            <li
              key={contact.id}
              onMouseEnter={() => setHoveredId(contact.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '6px 0',
                borderBottom: '1px solid var(--rule)',
              }}
            >
              {/* Text info — always visible */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <button
                  type="button"
                  onClick={() => setSelectedContact(contact)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--ink-1)',
                    cursor: 'pointer',
                    fontFamily: 'var(--body)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    padding: 0,
                    textAlign: 'left',
                    maxWidth: '100%',
                  }}
                >
                  {contact.name}
                </button>
                {contact.title && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--ink-2)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {contact.title}
                  </div>
                )}
                {contact.email && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {contact.email}
                  </div>
                )}
                {contact.phone && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {contact.phone}
                  </div>
                )}
              </div>

              {/* Action icons — visible on hover */}
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  alignItems: 'center',
                  flexShrink: 0,
                  opacity: hoveredId === contact.id || confirmDeleteId === contact.id ? 1 : 0,
                  transition: 'opacity 150ms var(--ease)',
                }}
                aria-hidden={hoveredId !== contact.id && confirmDeleteId !== contact.id}
              >
                {confirmDeleteId === contact.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDelete(contact)}
                      disabled={isDeleting}
                      aria-label={`Confirm delete ${contact.name}`}
                      style={{
                        border: '1px solid var(--accent)',
                        borderRadius: 4,
                        background: 'transparent',
                        color: 'var(--accent)',
                        cursor: isDeleting ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--body)',
                        fontSize: 11,
                        padding: '4px 7px',
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      aria-label={`Cancel delete ${contact.name}`}
                      style={{
                        border: '1px solid var(--rule)',
                        borderRadius: 4,
                        background: 'transparent',
                        color: 'var(--ink-2)',
                        cursor: 'pointer',
                        fontFamily: 'var(--body)',
                        fontSize: 11,
                        padding: '4px 7px',
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    aria-label={`Email ${contact.name}`}
                    tabIndex={hoveredId === contact.id ? 0 : -1}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: 4,
                      border: '1px solid var(--rule)',
                      color: 'var(--ink-3)',
                      background: 'transparent',
                    }}
                  >
                    <Mail size={12} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`msteams://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(contact.email)}`}
                    aria-label={`Teams message ${contact.name}`}
                    tabIndex={hoveredId === contact.id ? 0 : -1}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: 4,
                      border: '1px solid var(--rule)',
                      color: 'var(--ink-3)',
                      background: 'transparent',
                    }}
                  >
                    <MessageSquare size={12} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`msteams://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(contact.email)}`}
                    aria-label={`Teams call ${contact.name}`}
                    tabIndex={hoveredId === contact.id ? 0 : -1}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: 4,
                      border: '1px solid var(--rule)',
                      color: 'var(--ink-3)',
                      background: 'transparent',
                    }}
                  >
                    <PhoneCall size={12} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(contact.id)}
                      aria-label={`Delete ${contact.name}`}
                      tabIndex={hoveredId === contact.id ? 0 : -1}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 26,
                        height: 26,
                        borderRadius: 4,
                        border: '1px solid var(--rule)',
                        color: 'var(--accent)',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {selectedContact && (
        <ContactCardDialog
          contact={selectedContact}
          onSaved={setSelectedContact}
          onClose={() => setSelectedContact(null)}
        />
      )}
    </Tile>
  );
}
