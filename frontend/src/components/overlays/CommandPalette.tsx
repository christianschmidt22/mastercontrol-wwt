/**
 * CommandPalette.tsx
 *
 * Global Ctrl+K command palette. Renders as a full-screen fixed backdrop with
 * a centred dialog. Filters orgs (Customers + OEMs) and exposes two static
 * actions (Add task, Toggle theme).
 *
 * ARIA pattern: combobox input + listbox results (§ Command palette in DESIGN.md).
 * Focus-trap: Tab/Shift+Tab cycles only inside the dialog while open.
 * Reduced-motion: entry animation is skipped when prefers-reduced-motion: reduce.
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, SunMoon, Search } from 'lucide-react';
import { useOrganizations } from '../../api/useOrganizations';
import { useUiStore } from '../../store/useUiStore';
import type { Organization } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrgItem = {
  kind: 'org';
  id: string;
  org: Organization;
};

type ActionItem = {
  kind: 'action';
  id: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  onActivate: () => void;
};

type PaletteItem = OrgItem | ActionItem;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { data: allOrgs } = useOrganizations();
  const { theme, setTheme } = useUiStore();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const uid = useId();
  const resultsId = `${uid}-results`;

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      // Focus input on next tick so the dialog is mounted
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Toggle-theme action cycles system → dark → light → system
  const handleToggleTheme = useCallback(() => {
    const cycle: Array<'system' | 'dark' | 'light'> = ['system', 'dark', 'light'];
    const idx = cycle.indexOf(theme);
    const next = cycle[(idx + 1) % cycle.length] ?? 'system';
    setTheme(next);
    onClose();
  }, [theme, setTheme, onClose]);

  // Navigate to add-task page
  const handleAddTask = useCallback(() => {
    navigate('/tasks');
    onClose();
  }, [navigate, onClose]);

  // Static actions — memo so references stay stable
  const actions = useMemo<ActionItem[]>(
    () => [
      {
        kind: 'action',
        id: `${uid}-action-task`,
        label: 'Add task',
        sub: 'Anywhere',
        icon: <Plus size={16} strokeWidth={1.5} aria-hidden="true" />,
        onActivate: handleAddTask,
      },
      {
        kind: 'action',
        id: `${uid}-action-theme`,
        label: 'Toggle theme',
        sub: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`,
        icon: <SunMoon size={16} strokeWidth={1.5} aria-hidden="true" />,
        onActivate: handleToggleTheme,
      },
    ],
    [uid, handleAddTask, handleToggleTheme, theme],
  );

  // Filtered org items
  const orgItems = useMemo<OrgItem[]>(() => {
    const q = query.trim().toLowerCase();
    const orgs = allOrgs ?? [];
    return orgs
      .filter((o) => !q || o.name.toLowerCase().includes(q))
      .map((o) => ({
        kind: 'org' as const,
        id: `${uid}-org-${o.id}`,
        org: o,
      }));
  }, [allOrgs, query, uid]);

  // Filtered action items
  const actionItems = useMemo<ActionItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  // Flat list for keyboard navigation
  const flatItems = useMemo<PaletteItem[]>(
    () => [...orgItems, ...actionItems],
    [orgItems, actionItems],
  );

  // Clamp active index when list changes
  useEffect(() => {
    setActiveIndex((prev) =>
      flatItems.length === 0 ? 0 : Math.min(prev, flatItems.length - 1),
    );
  }, [flatItems.length]);

  // Activate the currently selected item
  const activateItem = useCallback(
    (item: PaletteItem) => {
      if (item.kind === 'org') {
        const path =
          item.org.type === 'customer'
            ? `/customers/${item.org.id}`
            : `/oem/${item.org.id}`;
        navigate(path);
        onClose();
      } else {
        item.onActivate();
      }
    },
    [navigate, onClose],
  );

  // Focus-trap: Tab / Shift+Tab stays inside dialog
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) =>
          flatItems.length === 0 ? 0 : (prev + 1) % flatItems.length,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          flatItems.length === 0
            ? 0
            : (prev - 1 + flatItems.length) % flatItems.length,
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) activateItem(item);
        return;
      }
      if (e.key === 'Tab') {
        // Trap focus inside dialog
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'input, button, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    },
    [flatItems, activeIndex, activateItem],
  );

  if (!isOpen) return null;

  const activeItemId = flatItems[activeIndex]?.id ?? undefined;

  // Separate customer vs OEM orgs for section headers
  const customers = orgItems.filter((o) => o.org.type === 'customer');
  const oems = orgItems.filter((o) => o.org.type === 'oem');

  return (
    /* Backdrop */
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(14, 17, 22, 0.72)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
      onClick={onClose}
    >
      {/* Dialog — stop propagation so clicks inside don't close */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={handleDialogKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          maxWidth: 640,
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <Search
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            style={{ color: 'var(--ink-3)', flex: 'none' }}
          />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls={resultsId}
            aria-activedescendant={activeItemId}
            placeholder="Search or type a command…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            autoComplete="off"
            spellCheck={false}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 18,
              color: 'var(--ink-1)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              width: '100%',
              lineHeight: 1.3,
              caretColor: 'var(--accent)',
            }}
          />
        </div>

        {/* Results listbox */}
        <div
          id={resultsId}
          role="listbox"
          aria-label="Results"
          style={{ padding: '8px 0 4px' }}
        >
          {customers.length > 0 && (
            <>
              <SectionHeader>Customers</SectionHeader>
              {customers.map((item) => (
                <OrgRow
                  key={item.id}
                  item={item}
                  itemId={item.id}
                  isSelected={flatItems.indexOf(item) === activeIndex}
                  onActivate={() => activateItem(item)}
                  onMouseEnter={() =>
                    setActiveIndex(flatItems.indexOf(item))
                  }
                />
              ))}
            </>
          )}

          {oems.length > 0 && (
            <>
              <SectionHeader style={{ marginTop: customers.length > 0 ? 4 : 0 }}>
                OEMs
              </SectionHeader>
              {oems.map((item) => (
                <OrgRow
                  key={item.id}
                  item={item}
                  itemId={item.id}
                  isSelected={flatItems.indexOf(item) === activeIndex}
                  onActivate={() => activateItem(item)}
                  onMouseEnter={() =>
                    setActiveIndex(flatItems.indexOf(item))
                  }
                />
              ))}
            </>
          )}

          {actionItems.length > 0 && (
            <>
              <SectionHeader
                style={{
                  marginTop: orgItems.length > 0 ? 4 : 0,
                }}
              >
                Actions
              </SectionHeader>
              {actionItems.map((item) => (
                <ActionRow
                  key={item.id}
                  item={item}
                  isSelected={flatItems.indexOf(item) === activeIndex}
                  onActivate={() => activateItem(item)}
                  onMouseEnter={() =>
                    setActiveIndex(flatItems.indexOf(item))
                  }
                />
              ))}
            </>
          )}

          {flatItems.length === 0 && (
            <div
              style={{
                padding: '20px 16px',
                fontSize: 13,
                color: 'var(--ink-3)',
                textAlign: 'center',
              }}
            >
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div
          style={{
            borderTop: '1px solid var(--rule)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <FooterHint keys={['↑', '↓']} label="navigate" />
          <FooterHint keys={['↵']} label="open" />
          <FooterHint keys={['Esc']} label="close" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
        padding: '4px 16px 6px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface OrgRowProps {
  item: OrgItem;
  itemId: string;
  isSelected: boolean;
  onActivate: () => void;
  onMouseEnter: () => void;
}

function OrgRow({ item, itemId, isSelected, onActivate, onMouseEnter }: OrgRowProps) {
  const label = item.org.type === 'customer' ? 'Customer' : 'OEM';
  return (
    <div
      id={itemId}
      role="option"
      aria-selected={isSelected}
      onClick={onActivate}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '9px 16px',
        cursor: 'pointer',
        background: isSelected ? 'var(--bg)' : 'transparent',
        transition: 'background-color 100ms cubic-bezier(0.2, 0, 0, 1)',
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Building2
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
          style={{ color: 'var(--ink-3)', flex: 'none' }}
        />
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-1)' }}>
            {item.org.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{label}</div>
        </div>
      </div>
      {isSelected && (
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--ink-3)',
          }}
        >
          ↵
        </span>
      )}
    </div>
  );
}

interface ActionRowProps {
  item: ActionItem;
  isSelected: boolean;
  onActivate: () => void;
  onMouseEnter: () => void;
}

function ActionRow({ item, isSelected, onActivate, onMouseEnter }: ActionRowProps) {
  return (
    <div
      id={item.id}
      role="option"
      aria-selected={isSelected}
      onClick={onActivate}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '9px 16px',
        cursor: 'pointer',
        background: isSelected ? 'var(--bg)' : 'transparent',
        transition: 'background-color 100ms cubic-bezier(0.2, 0, 0, 1)',
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--ink-3)', flex: 'none' }}>{item.icon}</span>
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-1)' }}>{item.label}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{item.sub}</div>
        </div>
      </div>
      {isSelected && (
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--ink-3)',
          }}
        >
          ↵
        </span>
      )}
    </div>
  );
}

function FooterHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        color: 'var(--ink-3)',
      }}
    >
      {keys.map((k) => (
        <kbd
          key={k}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            background: 'var(--bg)',
            border: '1px solid var(--rule)',
            borderRadius: 4,
            padding: '1px 5px',
            color: 'var(--ink-2)',
          }}
        >
          {k}
        </kbd>
      ))}
      {label}
    </span>
  );
}
