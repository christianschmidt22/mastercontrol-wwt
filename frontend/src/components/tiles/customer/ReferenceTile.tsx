import { useState, useRef, useEffect, type ReactNode, type KeyboardEvent } from 'react';
import { Building2, MapPin, Link as LinkIcon } from 'lucide-react';
import { Tile } from '../Tile';
import type { Organization } from '../../../types';

interface UseOrganizationResult {
  data: Organization | undefined;
  isLoading: boolean;
}

function useOrganizationStub(_orgId: number): UseOrganizationResult {
  return { data: undefined, isLoading: false };
}

interface ReferenceTileProps {
  orgId: number;
  _useOrganization?: (orgId: number) => UseOrganizationResult;
}

/**
 * Popover for a reference entry — keyboard accessible.
 * Closes on Escape or click outside.
 */
function ReferencePopover({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      aria-modal="true"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 50,
        marginTop: 6,
        padding: '14px 16px',
        background: 'var(--bg)',
        border: '1px solid var(--rule)',
        borderRadius: 8,
        minWidth: 220,
        maxWidth: 320,
        boxShadow: 'none',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ink-3)',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

interface RefEntry {
  id: string;
  label: string;
  icon: ReactNode;
  renderContent: (org: Organization | undefined) => ReactNode;
}

const ENTRIES: RefEntry[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: <Building2 size={16} strokeWidth={1.5} aria-hidden="true" />,
    renderContent: (org) => {
      if (!org) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No data.</p>;
      const meta = org.metadata ?? {};
      const fields = Object.entries(meta).filter(([, v]) => v !== null && v !== '');
      if (fields.length === 0) {
        return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No profile data yet.</p>;
      }
      return (
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fields.map(([key, value]) => (
            <div key={key} style={{ display: 'flex', gap: 8 }}>
              <dt style={{ fontSize: 11, color: 'var(--ink-3)', width: 80, flexShrink: 0 }}>
                {key}
              </dt>
              <dd style={{ fontSize: 13, color: 'var(--ink-1)', margin: 0 }}>
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      );
    },
  },
  {
    id: 'locations',
    label: 'Locations',
    icon: <MapPin size={16} strokeWidth={1.5} aria-hidden="true" />,
    renderContent: (org) => {
      if (!org) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No data.</p>;
      const locations = (org.metadata?.locations as string | undefined)?.split(',').map((l) => l.trim()).filter(Boolean);
      if (!locations?.length) {
        return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No locations recorded.</p>;
      }
      return (
        <ul role="list" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {locations.map((loc) => (
            <li key={loc} style={{ fontSize: 13, color: 'var(--ink-1)' }}>
              {loc}
            </li>
          ))}
        </ul>
      );
    },
  },
  {
    id: 'portals',
    label: 'Portals',
    icon: <LinkIcon size={16} strokeWidth={1.5} aria-hidden="true" />,
    renderContent: (org) => {
      if (!org) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No data.</p>;
      const portalUrl = org.metadata?.portal_url as string | undefined;
      if (!portalUrl) {
        return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No portal URL recorded.</p>;
      }
      return (
        <a
          href={portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 13, color: 'var(--ink-1)', wordBreak: 'break-all' }}
        >
          {portalUrl}
        </a>
      );
    },
  },
];

/**
 * ReferenceTile — Profile, Locations, Portals reference entries.
 *
 * Labels visible at rest per Q-1 / R-012 follow-up.
 * Click each entry to open a popover with the relevant data.
 */
export function ReferenceTile({ orgId, _useOrganization }: ReferenceTileProps) {
  const useOrganization = _useOrganization ?? useOrganizationStub;
  const { data: org } = useOrganization(orgId);

  const [openEntry, setOpenEntry] = useState<string | null>(null);

  const handleEntryKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpenEntry((prev) => (prev === id ? null : id));
    }
    if (e.key === 'Escape') {
      setOpenEntry(null);
    }
  };

  return (
    <Tile title="Reference">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          height: '100%',
        }}
      >
        {ENTRIES.map((entry) => (
          <div key={entry.id} style={{ position: 'relative' }}>
            <button
              type="button"
              aria-label={`Open ${entry.label}`}
              aria-expanded={openEntry === entry.id}
              aria-haspopup="dialog"
              onClick={() => setOpenEntry((prev) => (prev === entry.id ? null : entry.id))}
              onKeyDown={(e) => handleEntryKeyDown(e, entry.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '12px 6px',
                background: 'transparent',
                border: '1px solid var(--rule)',
                borderRadius: 6,
                color: 'var(--ink-1)',
                fontFamily: 'var(--body)',
                cursor: 'pointer',
                width: '100%',
                transition: 'background-color 150ms var(--ease), border-color 150ms var(--ease)',
              }}
            >
              <span style={{ color: 'var(--ink-2)' }}>{entry.icon}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 500 }}>
                {entry.label}
              </span>
            </button>

            {openEntry === entry.id && (
              <ReferencePopover
                title={entry.label}
                onClose={() => setOpenEntry(null)}
              >
                {entry.renderContent(org)}
              </ReferencePopover>
            )}
          </div>
        ))}
      </div>
    </Tile>
  );
}
