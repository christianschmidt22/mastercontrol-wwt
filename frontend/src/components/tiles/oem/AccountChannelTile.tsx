import { Mail, Phone } from 'lucide-react';
import { useState } from 'react';
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

interface AccountChannelTileProps {
  orgId: number;
  _useContacts?: (orgId: number) => UseContactsResult;
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
 */
export function AccountChannelTile({ orgId, _useContacts }: AccountChannelTileProps) {
  const useContacts = _useContacts ?? useContactsStub;
  const { data: contacts, isLoading } = useContacts(orgId);

  const all = contacts ?? [];
  const accountTeam = all.filter((c) => !c.role || c.role === 'account');
  const channelTeam = all.filter((c) => c.role === 'channel');

  return (
    <Tile title="Team" count={isLoading ? '…' : all.length || undefined}>
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && all.length === 0 && (
        <TileEmptyState
          copy="No contacts yet. Add the account team."
          actionLabel="Add contact"
          onAction={() => {}}
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
