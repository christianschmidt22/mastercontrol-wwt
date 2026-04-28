import {
  useState,
  useCallback,
  useId,
  type FormEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { Mail, Phone, Plus } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Contact, ContactCreate } from '../../../types';
import {
  useContacts as useContactsReal,
  useCreateContact as useCreateContactReal,
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

function useContactsStub(_orgId: number): UseContactsResult {
  return { data: undefined, isLoading: false };
}

function useCreateContactStub(): UseCreateContactResult {
  return { mutate: () => {}, isPending: false };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AccountChannelTileProps {
  orgId: number;
  _useContacts?: (orgId: number) => UseContactsResult;
  _useCreateContact?: () => UseCreateContactResult;
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

/** Simple email format check — validation on submit only. */
function isValidEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

/**
 * ContactRow — reusable compact row for a single contact.
 */
function ContactRow({ contact }: { contact: Contact }) {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '5px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--ink-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {contact.name}
        </div>
        {contact.title && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {contact.title}
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 4,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 150ms var(--ease)',
        }}
        aria-hidden={!hovered}
      >
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            aria-label={`Email ${contact.name}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 4,
              border: '1px solid var(--rule)',
              color: 'var(--ink-3)',
              background: 'transparent',
            }}
          >
            <Mail size={11} strokeWidth={1.5} aria-hidden="true" />
          </a>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            aria-label={`Call ${contact.name}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 4,
              border: '1px solid var(--rule)',
              color: 'var(--ink-3)',
              background: 'transparent',
            }}
          >
            <Phone size={11} strokeWidth={1.5} aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * AccountChannelTile — contacts partitioned into Account team vs Channel team.
 *
 * Contact.role distinguishes team membership:
 *   - 'account' → Account Team section
 *   - 'channel' → Channel Team section
 *   - null/other → shown in Account Team as fallback
 *
 * "+" header button expands an inline add-contact form.
 * Name + Role are required; email is validated if provided.
 */
export function AccountChannelTile({
  orgId,
  _useContacts,
  _useCreateContact,
}: AccountChannelTileProps) {
  const useContacts = _useContacts ?? useContactsReal;
  const useCreateContact = _useCreateContact ?? useCreateContactReal;

  const { data: contacts, isLoading } = useContacts(orgId);
  const { mutate: createContact, isPending } = useCreateContact();

  const [adding, setAdding] = useState(false);
  const [optimisticContacts, setOptimisticContacts] = useState<Contact[]>([]);

  // Form state
  const [nameVal, setNameVal] = useState('');
  const [titleVal, setTitleVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [roleVal, setRoleVal] = useState<'account' | 'channel' | ''>('');
  const [formError, setFormError] = useState<string | null>(null);

  const id = useId();
  const nameId = `${id}-name`;
  const titleId = `${id}-title`;
  const emailId = `${id}-email`;
  const roleId = `${id}-role`;

  const isDirty =
    nameVal.trim() !== '' ||
    titleVal.trim() !== '' ||
    emailVal.trim() !== '' ||
    roleVal !== '';

  const resetForm = useCallback(() => {
    setNameVal('');
    setTitleVal('');
    setEmailVal('');
    setRoleVal('');
    setFormError(null);
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    setAdding(false);
  }, [resetForm]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLFormElement>) => {
      if (e.key === 'Escape') handleCancel();
    },
    [handleCancel],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const name = nameVal.trim();
      if (!name) {
        setFormError('Name is required.');
        return;
      }
      if (name.length > 200) {
        setFormError('Name must be 200 characters or fewer.');
        return;
      }
      const email = emailVal.trim();
      if (email && !isValidEmail(email)) {
        setFormError('Email must be a valid address.');
        return;
      }
      if (!roleVal) {
        setFormError('Role is required.');
        return;
      }

      const optimistic: Contact = {
        id: -Date.now(),
        organization_id: orgId,
        name,
        title: titleVal.trim() || null,
        email: email || null,
        phone: null,
        role: roleVal,
        created_at: new Date().toISOString(),
        assigned_org_ids: [],
      };
      setOptimisticContacts((prev) => [...prev, optimistic]);

      createContact(
        {
          organization_id: orgId,
          name,
          title: titleVal.trim() || null,
          email: email || null,
          phone: null,
          role: roleVal,
        },
        { onSuccess: () => setOptimisticContacts([]) },
      );

      resetForm();
      setAdding(false);
    },
    [nameVal, titleVal, emailVal, roleVal, orgId, createContact, resetForm],
  );

  const all = [...(contacts ?? []), ...optimisticContacts];
  const accountTeam = all.filter((c) => !c.role || c.role === 'account');
  const channelTeam = all.filter((c) => c.role === 'channel');

  return (
    <Tile
      title="Team"
      count={isLoading ? '…' : all.length || undefined}
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
          onKeyDown={handleKeyDown}
          noValidate
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: all.length > 0 ? 14 : 0,
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
              placeholder="e.g. Account Manager"
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
              onChange={(e) => {
                setEmailVal(e.target.value);
                setFormError(null);
              }}
              placeholder="name@example.com"
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
              onChange={(e) => {
                setRoleVal(e.target.value as 'account' | 'channel' | '');
                setFormError(null);
              }}
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
                border: isDirty ? 'none' : '1px solid var(--rule)',
                borderRadius: 4,
                background: isDirty ? 'var(--accent)' : 'transparent',
                color: isDirty ? '#fff' : 'var(--ink-3)',
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

      {!isLoading && all.length === 0 && !adding && (
        <TileEmptyState
          copy="No contacts yet. Add the account team."
          ariaLive
        />
      )}

      {(accountTeam.length > 0 || channelTeam.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {accountTeam.length > 0 && (
            <section aria-label="Account team">
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--ink-3)',
                  margin: '0 0 6px',
                  fontFamily: 'var(--body)',
                }}
              >
                Account Team
              </h3>
              <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {accountTeam.map((c) => (
                  <ContactRow key={c.id} contact={c} />
                ))}
              </ul>
            </section>
          )}

          {channelTeam.length > 0 && (
            <section aria-label="Channel team">
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--ink-3)',
                  margin: '0 0 6px',
                  fontFamily: 'var(--body)',
                }}
              >
                Channel Team
              </h3>
              <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {channelTeam.map((c) => (
                  <ContactRow key={c.id} contact={c} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Tile>
  );
}
