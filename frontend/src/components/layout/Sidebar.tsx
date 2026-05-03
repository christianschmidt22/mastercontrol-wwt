import type { ReactNode, KeyboardEvent, DragEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, CheckSquare, BarChart2, Bot, Settings, Package, Bell, Users, Wrench } from 'lucide-react';
import { clsx } from 'clsx';
import { useOrganizations, useOrgLastTouched } from '../../api/useOrganizations';
import { useCaptureAction } from '../../api/useCaptureAction';
import { CaptureActionModal } from '../capture/CaptureActionModal';
import {
  captureScreenToAttachment,
  fileToCaptureAttachment,
  type CaptureAttachmentDraft,
} from '../../utils/captureActionFiles';
import type { CaptureActionResult } from '../../types';

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

/**
 * Returns true when the ISO timestamp falls within the last 48 hours.
 * Returns false for missing, null, or unparseable values.
 */
function isWithin48h(iso: string | undefined): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < 48 * 60 * 60 * 1000;
}

const DEFAULT_CAPTURE_PROMPT =
  'Read the attached screenshot or file and create the right reminder/task. If there is no action to take, summarize what it says.';

function orgIdFromPath(pathname: string): number | null {
  const match = pathname.match(/^\/(?:customers|oem)\/(\d+)/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
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
          'text-sm font-normal no-underline',
          'border-l-2 transition-[background-color,color] duration-200',
          isActive
            ? 'border-l-accent bg-bg-2 rounded-l-none -ml-0.5 text-ink-1'
            : 'border-l-transparent hover:bg-bg-2 text-ink-2',
        )
      }
    >
      <span aria-hidden="true" style={{ color: 'var(--ink-2)', flexShrink: 0 }}>
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

/** Hairline rule between sidebar sections — 12 px vertical rhythm. */
function Divider() {
  return (
    <hr
      aria-hidden="true"
      style={{
        border: 0,
        borderTop: '1px solid var(--rule)',
        margin: '2px 0',
      }}
    />
  );
}

/** Inline empty-state message shown when an org list has no entries. */
function EmptyState({ message }: { message: string }) {
  return (
    <p
      style={{
        color: 'var(--ink-3)',
        fontSize: 12,
        fontStyle: 'italic',
        fontFamily: 'var(--body)',
        padding: '6px 10px',
        margin: 0,
      }}
    >
      {message}
    </p>
  );
}

/** Dashed error state with a retry button. */
function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
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
        onClick={onRetry}
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
  );
}

/** Shared skeleton shown while org lists are loading. */
function LoadingState() {
  return (
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
  );
}

/** Vermilion dot indicating recent (< 48 h) activity for a given org. */
function ActivityDot() {
  return (
    <span
      aria-label="Recent activity"
      style={{
        display: 'inline-block',
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: 'var(--accent)',
        flexShrink: 0,
      }}
    />
  );
}

function customerPinRank(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized.includes('c.h. robinson') || normalized.includes('chr')) return 0;
  if (normalized.includes('fairview')) return 1;
  return 2;
}

function orderSidebarCustomers<T extends { name: string }>(customers: T[]): T[] {
  return [...customers].sort((a, b) => {
    const rankDiff = customerPinRank(a.name) - customerPinRank(b.name);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const navRef = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const { mutateAsync: runCaptureAction, isPending: captureIsPending } = useCaptureAction();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureDragging, setCaptureDragging] = useState(false);
  const [captureAttachments, setCaptureAttachments] = useState<CaptureAttachmentDraft[]>([]);
  const [capturePrompt, setCapturePrompt] = useState(DEFAULT_CAPTURE_PROMPT);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureActionResult | null>(null);

  // Customer list + activity map
  const {
    data: customers,
    isLoading: customersLoading,
    isError: customersError,
    refetch: refetchCustomers,
  } = useOrganizations('customer');

  const { data: customerLastTouched } = useOrgLastTouched('customer');

  const openCapture = useCallback((attachments: CaptureAttachmentDraft[]) => {
    setCaptureAttachments(attachments);
    setCapturePrompt(DEFAULT_CAPTURE_PROMPT);
    setCaptureError(null);
    setCaptureResult(null);
    setCaptureOpen(true);
  }, []);

  const addCaptureAttachments = useCallback((attachments: CaptureAttachmentDraft[]) => {
    setCaptureAttachments((current) => [...current, ...attachments].slice(0, 3));
    setCaptureError(null);
    setCaptureResult(null);
  }, []);

  const handleCaptureClick = useCallback(async () => {
    try {
      const attachment = await captureScreenToAttachment();
      openCapture([attachment]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') return;
      setCaptureAttachments([]);
      setCapturePrompt(DEFAULT_CAPTURE_PROMPT);
      setCaptureResult(null);
      setCaptureError(err instanceof Error ? err.message : 'Could not capture the screen');
      setCaptureOpen(true);
    }
  }, [openCapture]);

  const handleCaptureDrop = useCallback(async (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setCaptureDragging(false);
    const files = Array.from(event.dataTransfer.files).slice(0, 3);
    if (files.length === 0) return;
    try {
      openCapture(await Promise.all(files.map(fileToCaptureAttachment)));
    } catch (err) {
      setCaptureAttachments([]);
      setCaptureResult(null);
      setCaptureError(err instanceof Error ? err.message : 'Could not read dropped file');
      setCaptureOpen(true);
    }
  }, [openCapture]);

  const closeCapture = useCallback(() => {
    setCaptureOpen(false);
    setCaptureAttachments([]);
    setCaptureError(null);
    setCaptureResult(null);
  }, []);

  const submitCapture = useCallback(async () => {
    setCaptureError(null);
    try {
      const result = await runCaptureAction({
        prompt: capturePrompt,
        organization_id: orgIdFromPath(location.pathname),
        attachments: captureAttachments.map(({ name, mime_type, data_base64 }) => ({
          name,
          mime_type,
          data_base64,
        })),
      });
      setCaptureResult(result);
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : 'Capture action failed');
    }
  }, [captureAttachments, capturePrompt, location.pathname, runCaptureAction]);

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

  const customerList = customers ?? [];
  const orderedCustomerList = orderSidebarCustomers(customerList);
  return (
    <nav
      ref={setNavRef}
      aria-label="Primary navigation"
      className="flex flex-col gap-4 h-full"
      style={{
        padding: '20px 14px',
        borderRight: '1px solid var(--rule)',
        background: 'var(--surface)',
      }}
      onKeyDown={handleNavKeyDown}
    >
      {/* Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 8px 12px',
          borderBottom: '1px solid var(--rule)',
          color: 'var(--ink-1)',
        }}
      >
        <button
          type="button"
          aria-label="Capture with MasterControl"
          title="Capture with MasterControl"
          onClick={() => void handleCaptureClick()}
          onDragOver={(event) => {
            event.preventDefault();
            setCaptureDragging(true);
          }}
          onDragLeave={() => setCaptureDragging(false)}
          onDrop={(event) => void handleCaptureDrop(event)}
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 8,
            border: captureDragging ? '1px solid var(--accent)' : '1px solid transparent',
            background: captureDragging ? 'var(--bg-2)' : 'transparent',
            cursor: 'pointer',
            padding: 2,
          }}
        >
          <img
            src="/brand/sidebar-mcp.png"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            style={{ display: 'block' }}
          />
        </button>
        <div
          style={{
            fontFamily: 'var(--display)',
            fontWeight: 600,
            fontSize: 18,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
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
            Mark 0.1
          </span>
        </div>
      </div>

      <CaptureActionModal
        open={captureOpen}
        attachments={captureAttachments}
        prompt={capturePrompt}
        isRunning={captureIsPending}
        error={captureError}
        result={captureResult}
        onPromptChange={setCapturePrompt}
        onAttachmentsAdd={addCaptureAttachments}
        onClose={closeCapture}
        onSubmit={() => void submitCapture()}
      />

      {/* Top nav */}
      <Section>
        <NavItem to="/" icon={<Home size={16} strokeWidth={1.5} />} label="Home" />
        <NavItem
          to="/tasks"
          icon={<CheckSquare size={16} strokeWidth={1.5} />}
          label="Tasks"
        />
        <NavItem
          to="/alerts"
          icon={<Bell size={16} strokeWidth={1.5} />}
          label="Alerts"
        />
        <NavItem
          to="/reports"
          icon={<BarChart2 size={16} strokeWidth={1.5} />}
          label="Reports"
        />
        <NavItem
          to="/contacts"
          icon={<Users size={16} strokeWidth={1.5} />}
          label="Contacts"
        />
        <NavItem
          to="/tools"
          icon={<Wrench size={16} strokeWidth={1.5} />}
          label="Tools"
        />
      </Section>

      <Divider />

      {/* Customers */}
      <Section heading="Customers">
        {customersLoading && <LoadingState />}
        {customersError && !customersLoading && (
          <LoadError onRetry={() => void refetchCustomers()} />
        )}
        {!customersLoading && !customersError && customerList.length === 0 && (
          <EmptyState message="No customers yet — add one in the database" />
        )}
        {!customersLoading &&
          !customersError &&
          orderedCustomerList.map((c) => (
            <NavLink
              key={c.id}
              to={`/customers/${c.id}`}
              title={c.name}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-[10px] px-[10px] py-[7px] rounded-[6px]',
                  'text-sm font-normal no-underline',
                  'border-l-2 transition-[background-color,color] duration-200',
                  isActive
                    ? 'border-l-accent bg-bg-2 rounded-l-none -ml-0.5 text-ink-1'
                    : 'border-l-transparent hover:bg-bg-2 text-ink-2',
                )
              }
            >
              <span className="truncate flex-1 min-w-0">{c.name}</span>
              {isWithin48h(customerLastTouched?.[String(c.id)]) && <ActivityDot />}
            </NavLink>
          ))}
        <button
          type="button"
          className="mt-1.5 mx-2 px-[10px] py-1.5 text-xs rounded-md text-left"
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

      <Divider />

      {/* OEM */}
      <Section>
        <NavItem
          to="/oem"
          icon={<Package size={16} strokeWidth={1.5} />}
          label="OEM"
        />
        <NavItem to="/agents" icon={<Bot size={16} strokeWidth={1.5} />} label="Agents" />
        <NavItem
          to="/settings"
          icon={<Settings size={16} strokeWidth={1.5} />}
          label="Settings"
        />
      </Section>
    </nav>
  );
}
