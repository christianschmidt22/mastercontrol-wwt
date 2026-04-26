import type { ReactNode, KeyboardEvent } from 'react';
import { useCallback, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, CheckSquare, BarChart2, Bot, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { ThemeToggle } from './ThemeToggle';
import { useOrganizations } from '../../api/useOrganizations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the event's target is a form input, textarea,
 * contentEditable element, or a select — i.e. any context where arrow keys
 * have built-in meaning and must not be intercepted.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Collects all focusable sidebar links/buttons in DOM order from a nav element.
 * Excludes disabled buttons.
 */
function getSidebarFocusables(nav: HTMLElement): HTMLElement[] {
  return Array.from(
    nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface NavItemProps {
  to: string;
  icon: ReactNode;
  label: string;
}

function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-[10px] px-[10px] py-[7px] rounded-[6px]',
          'text-sm font-normal text-ink-1 no-underline',
          'border-l-2 transition-[background-color] duration-200',
          isActive
            ? 'border-l-accent bg-accent-soft rounded-l-none -ml-0.5'
            : 'border-l-transparent hover:bg-bg-2',
        )
      }
    >
      <span aria-hidden="true" style={{ color: 'var(--ink-2)' }}>
        {icon}
      </span>
      {label}
    </NavLink>
  );
}

interface SectionProps {
  heading?: string;
  children: ReactNode;
}

function Section({ heading, children }: SectionProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {heading && (
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.08em] px-2 pb-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          {heading}
        </div>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const navRef = useRef<HTMLElement | null>(null);

  const {
    data: customers,
    isLoading: customersLoading,
    isError: customersError,
    refetch: refetchCustomers,
  } = useOrganizations('customer');

  /**
   * Global keydown handler mounted on <window> so pressing "/" from anywhere
   * in the app focuses the first sidebar link (mirrors Slack / GitHub
   * behaviour). Guard: don't hijack when focus is in an editable element.
   */
  const handleSlashKey = useCallback((e: globalThis.KeyboardEvent) => {
    if (e.key !== '/') return;
    if (isEditableTarget(e.target)) return;
    if (!navRef.current) return;
    const focusables = getSidebarFocusables(navRef.current);
    if (focusables.length > 0) {
      e.preventDefault();
      focusables[0]!.focus();
    }
  }, []);

  // Register / unregister the global "/" listener via ref callback so we
  // don't need useEffect (avoids an exhaustive-deps lint warning on navRef).
  const setNavRef = useCallback(
    (node: HTMLElement | null) => {
      navRef.current = node;
      if (node) {
        window.addEventListener('keydown', handleSlashKey);
      } else {
        window.removeEventListener('keydown', handleSlashKey);
      }
    },
    [handleSlashKey],
  );

  /**
   * Arrow / Home / End / Space keyboard handler attached to the <nav>.
   * Only active when focus is already inside the sidebar.
   */
  const handleNavKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    // Never intercept when the event originates inside an editable element.
    if (isEditableTarget(e.target)) return;

    const nav = navRef.current;
    if (!nav) return;

    const focusables = getSidebarFocusables(nav);
    if (focusables.length === 0) return;

    const current = document.activeElement as HTMLElement;
    const idx = focusables.indexOf(current);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = idx === -1 || idx === focusables.length - 1 ? 0 : idx + 1;
        focusables[next]!.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = idx <= 0 ? focusables.length - 1 : idx - 1;
        focusables[prev]!.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        focusables[0]!.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        focusables[focusables.length - 1]!.focus();
        break;
      }
      case ' ': {
        // Space activates the focused element (links don't respond to Space by
        // default; buttons already do, so this only adds value for <a> links).
        if (current && current.tagName === 'A') {
          e.preventDefault();
          current.click();
        }
        break;
      }
      default:
        break;
    }
  }, []);

  return (
    <nav
      ref={setNavRef}
      role="navigation"
      aria-label="Primary"
      className="flex flex-col gap-6 h-full"
      style={{
        padding: '20px 14px',
        borderRight: '1px solid var(--rule)',
      }}
      onKeyDown={handleNavKeyDown}
    >
      {/* Brand */}
      <div
        style={{
          fontFamily: 'var(--display)',
          fontWeight: 600,
          fontSize: 18,
          letterSpacing: '-0.01em',
          padding: '4px 8px 12px',
          borderBottom: '1px solid var(--rule)',
          color: 'var(--ink-1)',
        }}
      >
        MasterControl
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--body)',
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginTop: 2,
          }}
        >
          Field Notes
        </span>
      </div>

      {/* Top nav */}
      <Section>
        <NavItem to="/" icon={<Home size={16} strokeWidth={1.5} />} label="Home" />
        <NavItem
          to="/tasks"
          icon={<CheckSquare size={16} strokeWidth={1.5} />}
          label="Tasks"
        />
        <NavItem
          to="/reports"
          icon={<BarChart2 size={16} strokeWidth={1.5} />}
          label="Reports"
        />
      </Section>

      {/* Customers */}
      <Section heading="Customers">
        {customersLoading && (
          <div
            style={{
              border: '1px dashed var(--rule)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
            }}
          >
            Loading…
          </div>
        )}
        {customersError && !customersLoading && (
          <div
            style={{
              border: '1px dashed var(--rule)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
            }}
          >
            Couldn't load orgs ·{' '}
            <button
              type="button"
              onClick={() => void refetchCustomers()}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink-2)',
                fontFamily: 'var(--body)',
                fontSize: 12,
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Retry
            </button>
          </div>
        )}
        {!customersLoading && !customersError && (customers ?? []).map((c) => (
          <NavLink
            key={c.id}
            to={`/customers/${c.id}`}
            title={c.name}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-[10px] px-[10px] py-[7px] rounded-[6px]',
                'text-sm font-normal text-ink-1 no-underline truncate',
                'border-l-2 transition-[background-color] duration-200',
                isActive
                  ? 'border-l-accent bg-accent-soft rounded-l-none -ml-0.5'
                  : 'border-l-transparent hover:bg-bg-2',
              )
            }
          >
            {c.name}
          </NavLink>
        ))}
        <button
          type="button"
          className="mt-1.5 mx-2 px-[10px] py-1.5 text-xs rounded-md text-left font-sans"
          style={{
            background: 'transparent',
            border: '1px dashed var(--rule)',
            color: 'var(--ink-2)',
            cursor: 'pointer',
            fontFamily: 'var(--body)',
          }}
          aria-label="Add customer"
        >
          + Add customer
        </button>
      </Section>

      {/* OEM + Agents */}
      <Section heading="OEM">
        <NavItem to="/oem" icon={<Bot size={16} strokeWidth={1.5} />} label="OEM" />
      </Section>

      <Section heading="AI">
        <NavItem to="/agents" icon={<Bot size={16} strokeWidth={1.5} />} label="Agents" />
      </Section>

      {/* Bottom: Settings + ThemeToggle */}
      <div className="mt-auto flex flex-col gap-0.5">
        <div className="flex items-center justify-between px-2 pb-1">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: 'var(--ink-3)' }}
          >
            Theme
          </span>
          <ThemeToggle />
        </div>
        <NavItem
          to="/settings"
          icon={<Settings size={16} strokeWidth={1.5} />}
          label="Settings"
        />
      </div>
    </nav>
  );
}
