import {
  useState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useCallback,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Plus, X } from 'lucide-react';
import {
  useReports,
  useCreateReport,
  useUpdateReport,
  useRunReportNow,
} from '../api/useReports';
import { useReportRuns } from '../api/useReportRuns';
import { ReportPreview } from '../components/overlays/ReportPreview';
import { useOrganizations } from '../api/useOrganizations';
import type {
  Report,
  ReportCreate,
  ReportTarget,
  ReportRun,
} from '../types/report';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Shape of an item in the GET /api/reports response. The backend
 * denormalizes the active schedule's `cron_expr`, `next_run_at`,
 * `last_run_at`, and the most recent run's `status` onto each row so
 * that the list view doesn't need a second query per report. These are
 * marked optional here so the page stays robust if Stream 2 ships the
 * route without one of them attached yet.
 */
type ReportListRow = Report & {
  cron_expr?: string;
  next_run_at?: number | null;
  last_run_at?: number | null;
  last_run_status?: ReportRun['status'] | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ultra-small cron humanizer. Handles the common shapes the user will
 * actually type for a single-user CRM (daily, weekday-set, every-N-minutes).
 * Falls back to the raw expression when the shape is unfamiliar.
 *
 * Format: `m h dom mon dow`
 */
export function humanizeCron(expr: string): string {
  const trimmed = expr.trim();
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return trimmed;
  const [m, h, dom, mon, dow] = fields as [string, string, string, string, string];

  // every N minutes — `*/15 * * * *`
  const minSlash = m.match(/^\*\/(\d+)$/);
  if (minSlash && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    const n = minSlash[1];
    return n === '1' ? 'Every minute' : `Every ${n} minutes`;
  }

  // every hour at :MM — `30 * * * *`
  if (/^\d+$/.test(m) && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every hour at :${m.padStart(2, '0')}`;
  }

  // daily at HH:MM — `0 7 * * *`
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === '*' && mon === '*' && dow === '*') {
    return `Every day at ${formatTime(parseInt(h, 10), parseInt(m, 10))}`;
  }

  // weekdays at HH:MM — `0 7 * * 1-5`
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === '*' && mon === '*' && dow === '1-5') {
    return `Weekdays at ${formatTime(parseInt(h, 10), parseInt(m, 10))}`;
  }

  // single dow at HH:MM — `0 7 * * 1`
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === '*' && mon === '*' && /^\d$/.test(dow)) {
    return `Every ${dayName(parseInt(dow, 10))} at ${formatTime(parseInt(h, 10), parseInt(m, 10))}`;
  }

  return trimmed;
}

function formatTime(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function dayName(n: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n] ?? `dow ${n}`;
}

/**
 * Five-field whitespace-separated; each field made of digits, `*`, `/`,
 * `,`, `-`. This is a shape check, not a semantic one. The plan calls
 * out that a real cron validator (`/api/reports/validate-cron`) is
 * desirable but not yet shipped.
 *
 * TODO(phase-2): once the backend validator endpoint exists, replace
 * this regex with a debounced server call so users see the same errors
 * the scheduler will reject on save.
 */
export function isCronShapeValid(expr: string): boolean {
  if (!expr) return false;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f) => /^[\d*/,\-]+$/.test(f));
}

function formatEpoch(secs: number | null): string {
  if (secs === null) return '—';
  const d = new Date(secs * 1000);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (Math.abs(diffSec) < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'running…';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

function targetLabel(target: ReportTarget, orgNames: Map<number, string>): string {
  if (target.length === 0) return '(no targets)';
  if (target[0] === 'all') return 'All orgs';
  const names = target
    .filter((t): t is number => typeof t === 'number')
    .map((id) => orgNames.get(id) ?? `#${id}`);
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

// ---------------------------------------------------------------------------
// Toast — minimal inline implementation matching mockups/overlays.html
// ---------------------------------------------------------------------------

interface ToastState {
  id: number;
  message: string;
  meta?: string;
  variant: 'confirm' | 'info' | 'error';
}

interface ToastViewportProps {
  toasts: ToastState[];
  onDismiss: (id: number) => void;
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          style={{
            width: 280,
            background: 'var(--bg-2)',
            border: '1px solid var(--rule)',
            borderLeftWidth: 3,
            borderLeftColor:
              t.variant === 'confirm' || t.variant === 'error'
                ? 'var(--accent)'
                : 'var(--ink-3)',
            borderRadius: 6,
            padding: '12px 14px 12px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                color: 'var(--ink-1)',
                lineHeight: 1.4,
                fontFamily: 'var(--body)',
                wordBreak: 'break-word',
              }}
            >
              {t.message}
            </div>
            {t.meta && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  marginTop: 2,
                  fontFamily: 'var(--body)',
                  wordBreak: 'break-word',
                }}
              >
                {t.meta}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
              flex: 'none',
            }}
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog — minimal accessible primitive, modeled after mockups/overlays.html
// ---------------------------------------------------------------------------

interface DialogProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  children: ReactNode;
  /** Wider variant for the History drawer. */
  wide?: boolean;
}

function Dialog({ open, onClose, titleId, title, children, wide }: DialogProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Esc to close + focus trap (basic — prev/next within the dialog).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    // Focus the close button on mount for keyboard users.
    closeBtnRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          maxWidth: wide ? 720 : 520,
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            padding: '20px 24px 0',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <h2
            id={titleId}
            style={{
              fontFamily: 'var(--display)',
              fontSize: 20,
              fontWeight: 500,
              color: 'var(--ink-1)',
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'transparent',
              borderRadius: 4,
              color: 'var(--ink-3)',
              cursor: 'pointer',
            }}
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>
        <div
          style={{
            padding: '12px 24px 20px',
            overflowY: 'auto',
            color: 'var(--ink-2)',
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: 'var(--body)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report form (create + edit)
// ---------------------------------------------------------------------------

interface ReportFormProps {
  /** Pass `null` for "new report"; otherwise the report being edited. */
  initial: Report | null;
  /**
   * Current cron for the report's schedule (separate row in the DB);
   * the form treats it as an editable field on the report record.
   */
  initialCron: string;
  orgs: Array<{ id: number; name: string }>;
  isSaving: boolean;
  onSave: (data: ReportCreate, idIfEdit?: number) => void;
  onCancel: () => void;
}

function ReportForm({
  initial,
  initialCron,
  orgs,
  isSaving,
  onSave,
  onCancel,
}: ReportFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [prompt, setPrompt] = useState(initial?.prompt_template ?? '');
  const [cron, setCron] = useState(initialCron || '0 7 * * *');
  // Multi-select: 'all' is a sentinel; otherwise a Set of org ids.
  const [allTargets, setAllTargets] = useState<boolean>(
    !initial || (initial.target.length > 0 && initial.target[0] === 'all'),
  );
  const [targetIds, setTargetIds] = useState<Set<number>>(
    () =>
      new Set(
        (initial?.target ?? []).filter(
          (t): t is number => typeof t === 'number',
        ),
      ),
  );

  const nameId = useId();
  const promptId = useId();
  const cronId = useId();
  const targetGroupId = useId();
  const cronErrorId = useId();

  const cronOk = isCronShapeValid(cron);
  const cronHelp = cronOk ? humanizeCron(cron) : '';

  const canSubmit =
    name.trim().length > 0 && prompt.trim().length > 0 && cronOk && !isSaving;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const target: ReportTarget = allTargets
      ? ['all']
      : Array.from(targetIds).sort((a, b) => a - b);
    onSave(
      {
        name: name.trim(),
        prompt_template: prompt,
        target,
        output_format: 'markdown',
        enabled: initial?.enabled ?? true,
        cron_expr: cron.trim(),
      },
      initial?.id,
    );
  };

  const inputStyle: CSSProperties = {
    border: '1px solid var(--rule)',
    borderRadius: 4,
    padding: '6px 8px',
    fontSize: 13,
    background: 'transparent',
    color: 'var(--ink-1)',
    fontFamily: 'var(--body)',
    width: '100%',
  };

  const labelStyle: CSSProperties = {
    fontSize: 11,
    color: 'var(--ink-3)',
    fontFamily: 'var(--body)',
    display: 'block',
    marginBottom: 3,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div>
        <label htmlFor={nameId} style={labelStyle}>
          Name
        </label>
        <input
          id={nameId}
          name="report-name"
          type="text"
          required
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor={promptId} style={labelStyle}>
          Prompt template
        </label>
        <textarea
          id={promptId}
          name="report-prompt"
          required
          rows={8}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{
            ...inputStyle,
            fontFamily: 'var(--mono)',
            fontSize: 12,
            resize: 'vertical',
            minHeight: 160,
          }}
          aria-describedby={`${promptId}-helper`}
        />
        <p
          id={`${promptId}-helper`}
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
            margin: '4px 0 0',
            lineHeight: 1.5,
          }}
        >
          Variables: <code style={{ fontFamily: 'var(--mono)' }}>{'{{date}}'}</code>,{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>{'{{tasks_due_today}}'}</code>,{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>{'{{recent_notes}}'}</code>.
        </p>
      </div>

      <fieldset
        style={{ border: 'none', padding: 0, margin: 0 }}
        aria-labelledby={targetGroupId}
      >
        <legend id={targetGroupId} style={labelStyle}>
          Target orgs
        </legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'var(--ink-1)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={allTargets}
              onChange={(e) => setAllTargets(e.target.checked)}
              style={{ accentColor: 'var(--ink-3)' }}
            />
            All orgs
          </label>
          {!allTargets && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 4,
                paddingLeft: 18,
                marginTop: 2,
              }}
            >
              {orgs.map((o) => (
                <label
                  key={o.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: 'var(--ink-2)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={targetIds.has(o.id)}
                    onChange={(e) => {
                      setTargetIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(o.id);
                        else next.delete(o.id);
                        return next;
                      });
                    }}
                    style={{ accentColor: 'var(--ink-3)' }}
                  />
                  {o.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      <div>
        <label htmlFor={cronId} style={labelStyle}>
          Schedule (cron)
        </label>
        <input
          id={cronId}
          name="report-cron"
          type="text"
          required
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          aria-invalid={!cronOk}
          aria-describedby={cronOk ? `${cronId}-helper` : cronErrorId}
          style={{
            ...inputStyle,
            fontFamily: 'var(--mono)',
            fontSize: 13,
          }}
        />
        {cronOk ? (
          <p
            id={`${cronId}-helper`}
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              margin: '4px 0 0',
            }}
          >
            {cronHelp}
          </p>
        ) : (
          <p
            id={cronErrorId}
            role="alert"
            style={{
              fontSize: 11,
              color: 'var(--accent)',
              fontFamily: 'var(--body)',
              margin: '4px 0 0',
            }}
          >
            Expected 5 fields (m h dom mon dow), each digits / `*` / `/` / `,` / `-`.
          </p>
        )}
      </div>

      <div>
        <span style={labelStyle}>Output destination</span>
        <p
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: 'var(--ink-3)',
            margin: 0,
            padding: '6px 8px',
            border: '1px dashed var(--rule)',
            borderRadius: 4,
            background: 'var(--bg)',
          }}
        >
          {initial
            ? `C:\\mastercontrol\\reports\\${initial.id}\\`
            : 'C:\\mastercontrol\\reports\\<id>\\  (assigned on save)'}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          paddingTop: 4,
          borderTop: '1px solid var(--rule)',
          marginTop: 4,
          paddingBlockStart: 14,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 13,
            padding: '7px 14px',
            borderRadius: 4,
            cursor: 'pointer',
            border: '1px solid var(--rule)',
            background: 'transparent',
            color: 'var(--ink-2)',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 13,
            padding: '7px 14px',
            borderRadius: 4,
            cursor: canSubmit ? 'pointer' : 'default',
            border: '1px solid var(--rule)',
            background: 'var(--bg)',
            color: 'var(--ink-1)',
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {isSaving ? 'Saving…' : initial ? 'Save changes' : 'Create report'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// History drawer — last 20 runs
// ---------------------------------------------------------------------------

interface HistoryProps {
  reportId: number;
}

function HistoryList({ reportId }: HistoryProps) {
  const runsQuery = useReportRuns(reportId);
  const runs = (runsQuery.data ?? []).slice(0, 20);

  if (runsQuery.isLoading) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading history…</p>
    );
  }

  if (runsQuery.isError) {
    return (
      <p
        role="alert"
        style={{ fontSize: 13, color: 'var(--ink-2)' }}
      >
        Couldn't load run history.
      </p>
    );
  }

  if (runs.length === 0) {
    return (
      <div
        style={{
          border: '1px dashed var(--rule)',
          borderRadius: 6,
          padding: '20px 16px',
          textAlign: 'center',
          fontSize: 14,
          color: 'var(--ink-2)',
          fontFamily: 'var(--body)',
        }}
      >
        No runs yet. Click <em>Run Now</em> to generate the first one.
      </div>
    );
  }

  return (
    <ul
      role="list"
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {runs.map((r) => (
        <HistoryRow key={r.id} run={r} reportId={reportId} />
      ))}
    </ul>
  );
}

interface HistoryRowProps {
  run: ReportRun;
  reportId: number;
}

function HistoryRow({ run, reportId }: HistoryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const canPreview = run.status === 'done' && run.output_path !== null;

  return (
    <li
      style={{
        padding: '10px 0',
        borderBottom: '1px dotted var(--rule)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <time
          dateTime={run.started_at}
          style={{
            fontSize: 13,
            color: 'var(--ink-1)',
            fontFamily: 'var(--body)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatRelative(run.started_at)}
        </time>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={run.status} />
          {canPreview && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse report preview' : 'Preview report output'}
              style={{
                fontFamily: 'var(--body)',
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 3,
                cursor: 'pointer',
                border: '1px solid var(--rule)',
                background: expanded ? 'var(--bg-2)' : 'transparent',
                color: 'var(--ink-2)',
              }}
            >
              {expanded ? 'Collapse' : 'Preview'}
            </button>
          )}
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          fontFamily: 'var(--body)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        Duration {formatDuration(run.started_at, run.finished_at)}
      </div>
      {run.output_path && (
        <code
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink-2)',
            wordBreak: 'break-all',
          }}
        >
          {run.output_path}
        </code>
      )}
      {run.error && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            margin: 0,
          }}
        >
          {run.error}
        </p>
      )}
      {expanded && canPreview && (
        <ReportPreview
          reportId={reportId}
          runId={run.id}
          runDate={run.started_at}
          enabled={expanded}
        />
      )}
    </li>
  );
}

// Status badge — neutral by default, vermilion only via focus rings
// (R-008): we use ink-3 / ink-2 / ink-1 here for at-rest status colors.
function StatusBadge({ status }: { status: ReportRun['status'] }) {
  const labels: Record<ReportRun['status'], string> = {
    queued: 'queued',
    running: 'running',
    done: 'done',
    failed: 'failed',
  };
  return (
    <span
      style={{
        fontSize: 11,
        fontFamily: 'var(--body)',
        fontWeight: 500,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: status === 'failed' ? 'var(--ink-1)' : 'var(--ink-2)',
        border: '1px solid var(--rule)',
        borderRadius: 3,
        padding: '1px 6px',
      }}
    >
      {labels[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Report row in the list
// ---------------------------------------------------------------------------

interface ReportRowProps {
  report: ReportListRow;
  orgNames: Map<number, string>;
  isRunning: boolean;
  onRun: () => void;
  onEdit: () => void;
  onHistory: () => void;
}

function ReportRow({
  report,
  orgNames,
  isRunning,
  onRun,
  onEdit,
  onHistory,
}: ReportRowProps) {
  const cronExpr = report.cron_expr ?? '';
  const cronText = cronExpr ? humanizeCron(cronExpr) : '—';
  return (
    <li
      style={{
        borderBottom: '1px solid var(--rule)',
        padding: '14px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h3
          style={{
            fontFamily: 'var(--display)',
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--ink-1)',
            margin: 0,
          }}
        >
          {report.name}
        </h3>
        <span
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {targetLabel(report.target, orgNames)}
        </span>
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '4px 16px',
          margin: 0,
          fontSize: 12,
          fontFamily: 'var(--body)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--ink-2)',
        }}
      >
        <div>
          <dt
            style={{
              fontSize: 10,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              margin: 0,
            }}
          >
            Schedule
          </dt>
          <dd style={{ margin: 0 }}>{cronText}</dd>
        </div>
        <div>
          <dt
            style={{
              fontSize: 10,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              margin: 0,
            }}
          >
            Last run
          </dt>
          <dd style={{ margin: 0 }}>
            {formatEpoch(report.last_run_at ?? null)}
            {report.last_run_status ? ` · ${report.last_run_status}` : ''}
          </dd>
        </div>
        <div>
          <dt
            style={{
              fontSize: 10,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              margin: 0,
            }}
          >
            Next run
          </dt>
          <dd style={{ margin: 0 }}>{formatEpoch(report.next_run_at ?? null)}</dd>
        </div>
      </dl>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning}
          aria-label={`Run ${report.name} now`}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            padding: '5px 12px',
            borderRadius: 4,
            cursor: isRunning ? 'progress' : 'pointer',
            border: '1px solid var(--rule)',
            background: 'var(--bg-2)',
            color: 'var(--ink-1)',
          }}
        >
          {isRunning ? 'Running…' : 'Run Now'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${report.name}`}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            padding: '5px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            border: '1px solid var(--rule)',
            background: 'transparent',
            color: 'var(--ink-2)',
          }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onHistory}
          aria-label={`View run history for ${report.name}`}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            padding: '5px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            border: '1px solid var(--rule)',
            background: 'transparent',
            color: 'var(--ink-2)',
          }}
        >
          History
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// ReportsPage
// ---------------------------------------------------------------------------

export function ReportsPage() {
  const reportsQuery = useReports();
  const customersQuery = useOrganizations('customer');
  const oemsQuery = useOrganizations('oem');

  const allOrgs = useMemo(
    () => [
      ...(customersQuery.data ?? []),
      ...(oemsQuery.data ?? []),
    ],
    [customersQuery.data, oemsQuery.data],
  );
  const orgNames = useMemo(
    () => new Map(allOrgs.map((o) => [o.id, o.name])),
    [allOrgs],
  );

  const createMutation = useCreateReport();
  const updateMutation = useUpdateReport();
  const runNowMutation = useRunReportNow();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [pendingRunId, setPendingRunId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const toastSeq = useRef(0);

  const pushToast = useCallback(
    (t: Omit<ToastState, 'id'>) => {
      const id = ++toastSeq.current;
      setToasts((prev) => [...prev, { ...t, id }]);
      // Auto-dismiss after 6s — matches mockups/overlays.html.
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 6000);
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const reports = (reportsQuery.data ?? []) as ReportListRow[];
  const editing: ReportListRow | null =
    editingId !== null ? reports.find((r) => r.id === editingId) ?? null : null;

  const handleSave = useCallback(
    (data: ReportCreate, idIfEdit?: number) => {
      if (idIfEdit !== undefined) {
        updateMutation.mutate(
          { id: idIfEdit, ...data },
          {
            onSuccess: () => {
              pushToast({ message: 'Report saved.', meta: data.name, variant: 'confirm' });
              setFormOpen(false);
              setEditingId(null);
            },
            onError: (err) => {
              pushToast({
                message: 'Save failed.',
                meta: err.message,
                variant: 'error',
              });
            },
          },
        );
      } else {
        createMutation.mutate(data, {
          onSuccess: (created) => {
            pushToast({
              message: 'Report created.',
              meta: created.name,
              variant: 'confirm',
            });
            setFormOpen(false);
          },
          onError: (err) => {
            pushToast({
              message: 'Create failed.',
              meta: err.message,
              variant: 'error',
            });
          },
        });
      }
    },
    [createMutation, updateMutation, pushToast],
  );

  const handleRun = useCallback(
    (id: number, name: string) => {
      setPendingRunId(id);
      runNowMutation.mutate(id, {
        onSuccess: (res) => {
          pushToast({
            message: `${name} ran. Output saved.`,
            meta: res.output_path,
            variant: 'confirm',
          });
          setPendingRunId((cur) => (cur === id ? null : cur));
        },
        onError: (err) => {
          pushToast({
            message: `${name} failed.`,
            meta: err.message,
            variant: 'error',
          });
          setPendingRunId((cur) => (cur === id ? null : cur));
        },
      });
    },
    [runNowMutation, pushToast],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      {/* Page header */}
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontFamily: 'var(--body)',
          marginBottom: 8,
        }}
      >
        REPORTS
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h1
          style={
            {
              fontFamily: 'var(--display)',
              fontSize: 56,
              fontWeight: 500,
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
              margin: 0,
              marginLeft: -3,
              textWrap: 'balance',
            }
          }
        >
          Reports
        </h1>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setFormOpen(true);
          }}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 13,
            padding: '7px 14px',
            borderRadius: 4,
            cursor: 'pointer',
            border: '1px solid var(--rule)',
            background: 'var(--bg-2)',
            color: 'var(--ink-1)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
          New Report
        </button>
      </div>

      <div style={{ maxWidth: '70ch' }}>
        {reportsQuery.isLoading && (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
        )}

        {reportsQuery.isError && (
          <p
            role="alert"
            style={{ fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--body)' }}
          >
            Couldn't load reports.
          </p>
        )}

        {!reportsQuery.isLoading && !reportsQuery.isError && reports.length === 0 && (
          <div
            style={{
              border: '1px dashed var(--rule)',
              borderRadius: 6,
              padding: '24px 20px',
              textAlign: 'center',
              fontSize: 14,
              color: 'var(--ink-2)',
              fontFamily: 'var(--body)',
              lineHeight: 1.6,
            }}
          >
            No reports yet. Create one with the <em>+ New Report</em> button.
          </div>
        )}

        {reports.length > 0 && (
          <>
          <h2
            style={{
              fontFamily: 'var(--body)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              margin: '0 0 4px',
            }}
          >
            Your reports
          </h2>
          <ul
            role="list"
            data-testid="reports-list"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {reports.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                orgNames={orgNames}
                isRunning={pendingRunId === r.id}
                onRun={() => handleRun(r.id, r.name)}
                onEdit={() => {
                  setEditingId(r.id);
                  setFormOpen(true);
                }}
                onHistory={() => setHistoryId(r.id)}
              />
            ))}
          </ul>
          </>
        )}
      </div>

      {/* Form dialog */}
      <Dialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        titleId="report-form-title"
        title={editing ? 'Edit report' : 'New report'}
      >
        <ReportForm
          initial={editing}
          initialCron={editing?.cron_expr ?? '0 7 * * *'}
          orgs={allOrgs}
          isSaving={isSaving}
          onSave={handleSave}
          onCancel={() => {
            setFormOpen(false);
            setEditingId(null);
          }}
        />
      </Dialog>

      {/* History drawer */}
      <Dialog
        open={historyId !== null}
        onClose={() => setHistoryId(null)}
        titleId="report-history-title"
        title="Run history"
        wide
      >
        {historyId !== null && <HistoryList reportId={historyId} />}
      </Dialog>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
