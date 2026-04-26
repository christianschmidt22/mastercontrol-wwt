import { useState } from 'react';
import { Mail, Phone, Plus } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Contact } from '../../../types';

interface UseContactsResult {
  data: Contact[] | undefined;
  isLoading: boolean;
}

function useContactsStub(_orgId: number): UseContactsResult {
  return { data: undefined, isLoading: false };
}

interface ContactsTileProps {
  orgId: number;
  editMode?: boolean;
  _useContacts?: (orgId: number) => UseContactsResult;
}

/**
 * ContactsTile — compact contact list for the org.
 *
 * Name (14px), title in --ink-2, email/phone behind hover.
 * In edit mode, allows inline add.
 */
export function ContactsTile({ orgId, editMode, _useContacts }: ContactsTileProps) {
  const useContacts = _useContacts ?? useContactsStub;
  const { data: contacts, isLoading } = useContacts(orgId);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const contactList = contacts ?? [];

  return (
    <Tile title="Contacts" count={isLoading ? '…' : contactList.length || undefined}>
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && contactList.length === 0 && !showAdd && (
        <TileEmptyState
          copy="No contacts yet. Add the account team."
          actionLabel="Add contact"
          onAction={() => setShowAdd(true)}
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
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
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
              </div>

              {/* Email/phone — visible on hover */}
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  alignItems: 'center',
                  opacity: hoveredId === contact.id ? 1 : 0,
                  transition: 'opacity 150ms var(--ease)',
                }}
                aria-hidden={hoveredId !== contact.id}
              >
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    aria-label={`Email ${contact.name}`}
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
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    aria-label={`Call ${contact.name}`}
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
                    <Phone size={12} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editMode && !showAdd && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
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
          Add contact
        </button>
      )}

      {showAdd && (
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
          Contact form — coming soon.
        </p>
      )}
    </Tile>
  );
}
