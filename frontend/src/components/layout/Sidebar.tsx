import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, CheckSquare, BarChart2, Bot, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { ThemeToggle } from './ThemeToggle';

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

// Static customer list — placeholder until the query layer lands (Agent 2).
const STATIC_CUSTOMERS = [
  { id: '1', name: 'Fairview Health' },
  { id: '2', name: 'CHR Health' },
  { id: '3', name: 'Memorial Hermann' },
  { id: '4', name: 'Allina Health' },
];

export function Sidebar() {
  return (
    <nav
      aria-label="Primary"
      className="flex flex-col gap-6 h-full"
      style={{
        padding: '20px 14px',
        borderRight: '1px solid var(--rule)',
      }}
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
        {STATIC_CUSTOMERS.map((c) => (
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
