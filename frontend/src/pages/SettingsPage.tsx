/**
 * SettingsPage — Phase 1
 *
 * Sections:
 *   1. AI Credentials  — Anthropic API key (password field)
 *   2. Default Model   — <select> backed by 'default_model' setting
 *   3. Note Sources    — WorkVault root + OneDrive root paths
 *   4. Background Scheduler — read-only Phase-2 placeholder
 *   5. Agent Overrides — one-line nav link to /agents
 *
 * Design: DESIGN.md "Field Notes" aesthetic.
 * A11y: every input has <label htmlFor>, aria-live status, focus-visible rings.
 * Warn on unsaved navigation: beforeunload listener when any section is dirty.
 */

import {
  type FormEvent,
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { NavLink } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useSetting, useSetSetting } from '../api/useSettings';
import { FormField } from '../components/forms/FormField';

// ─── Shared style tokens ────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 14,
  color: 'var(--ink-1)',
  background: 'var(--bg)',
  border: '1px solid var(--rule)',
  borderRadius: 6,
  padding: '8px 12px',
  width: '100%',
  transition: 'border-color 150ms var(--ease)',
};

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  // Explicit background/color required for dark-mode native selects
  // (Vercel guideline: never rely on UA default for form control colours)
  backgroundColor: 'var(--bg)',
  color: 'var(--ink-1)',
  appearance: 'auto',
  cursor: 'pointer',
};

const CARD_STYLE: React.CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 8,
  padding: 32,
  background: 'var(--bg)',
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--display)',
  fontWeight: 500,
  fontSize: 24,
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  color: 'var(--ink-1)',
  marginBottom: 16,
  textWrap: 'balance' as React.CSSProperties['textWrap'],
};

const SAVE_BTN_BASE: React.CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 13,
  fontWeight: 500,
  padding: '8px 18px',
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid var(--rule)',
  background: 'var(--bg-2)',
  color: 'var(--ink-1)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  transition: 'opacity 150ms var(--ease), background-color 150ms var(--ease)',
};

// ─── Status pill ─────────────────────────────────────────────────────────────

interface StatusPillProps {
  /** Epoch ms of when "Saved" happened, or null if not yet saved */
  savedAt: number | null;
}

function StatusPill({ savedAt }: StatusPillProps) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (savedAt === null) {
      setLabel('');
      return;
    }

    function tick() {
      if (savedAt === null) return;
      const diffMs = Date.now() - savedAt;
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 5) {
        setLabel('Saved');
      } else if (diffSec < 60) {
        setLabel(`Saved ${diffSec}s ago`);
      } else {
        const diffMin = Math.floor(diffSec / 60);
        setLabel(`Saved ${diffMin}m ago`);
      }
    }

    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [savedAt]);

  // Auto-dismiss the "Saved" text after 3 s
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (savedAt === null) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(id);
  }, [savedAt]);

  return (
    <span
      aria-live="polite"
      style={{
        fontSize: 12,
        color: 'var(--ink-2)',
        fontFamily: 'var(--body)',
        minHeight: 18,
        display: 'inline-block',
        transition: 'opacity 240ms var(--ease)',
        opacity: visible ? 1 : 0,
      }}
    >
      {label}
    </span>
  );
}

// ─── Section 1: AI Credentials ───────────────────────────────────────────────

function ApiKeySection() {
  const { data: existing } = useSetting('anthropic_api_key');
  const setSetting = useSetSetting();

  const [value, setValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useBeforeUnloadGuard(dirty);

  // Mark dirty when user types
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    setDirty(true);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) {
      setError('API key is required.');
      inputRef.current?.focus();
      return;
    }
    setError('');
    try {
      await setSetting.mutateAsync({ key: 'anthropic_api_key', value: value.trim() });
      setValue('');
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed. Try again.');
    }
  }

  const isPending = setSetting.isPending;

  return (
    <section aria-labelledby="section-ai-credentials">
      <h2 id="section-ai-credentials" style={SECTION_TITLE_STYLE}>
        AI Credentials
      </h2>
      <div style={CARD_STYLE}>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <FormField
            id="anthropic_api_key"
            label="Anthropic API key"
            helper="Stored locally and DPAPI-encrypted on Windows. Never sent to the frontend after save."
            error={error}
          >
            <input
              id="anthropic_api_key"
              ref={inputRef}
              type="password"
              autoComplete="off"
              spellCheck={false}
              name="anthropic_api_key"
              placeholder={existing?.value ?? 'sk-ant-…'}
              value={value}
              onChange={handleChange}
              aria-describedby={error ? 'anthropic_api_key-error' : 'anthropic_api_key-helper'}
              style={{
                ...INPUT_STYLE,
                borderColor: error ? 'var(--accent)' : 'var(--rule)',
              }}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor = 'var(--accent)';
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor =
                  error ? 'var(--accent)' : 'var(--rule)';
              }}
            />
          </FormField>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={isPending || !dirty}
              style={{
                ...SAVE_BTN_BASE,
                opacity: isPending || !dirty ? 0.5 : 1,
                cursor: isPending || !dirty ? 'default' : 'pointer',
              }}
            >
              {isPending && (
                <Loader2
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              {isPending ? 'Saving…' : 'Save API Key'}
            </button>
            <StatusPill savedAt={savedAt} />
          </div>
        </form>
      </div>
    </section>
  );
}

// ─── Section 2: Default Model ─────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 (recommended)' },
  { value: 'claude-opus-4-7',   label: 'claude-opus-4-7' },
  { value: 'claude-haiku-4-5',  label: 'claude-haiku-4-5' },
] as const;

type ModelValue = (typeof MODEL_OPTIONS)[number]['value'];

function DefaultModelSection() {
  const { data: existing } = useSetting('default_model');
  const setSetting = useSetSetting();

  const resolvedExisting = (existing?.value ?? 'claude-sonnet-4-6') as ModelValue;

  const [selected, setSelected] = useState<ModelValue>('claude-sonnet-4-6');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  useBeforeUnloadGuard(dirty);

  // Sync once the query resolves
  useEffect(() => {
    if (existing?.value && !dirty) {
      const v = existing.value as ModelValue;
      if (MODEL_OPTIONS.some((o) => o.value === v)) {
        setSelected(v);
      }
    }
  }, [existing?.value, dirty]);

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    setSelected(e.target.value as ModelValue);
    setDirty(true);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await setSetting.mutateAsync({ key: 'default_model', value: selected });
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed. Try again.');
    }
  }

  const isPending = setSetting.isPending;

  return (
    <section aria-labelledby="section-default-model">
      <h2 id="section-default-model" style={SECTION_TITLE_STYLE}>
        Default Model
      </h2>
      <div style={CARD_STYLE}>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <FormField
            id="default_model"
            label="Model"
            error={error}
            helper={`Currently: ${resolvedExisting}`}
          >
            <select
              id="default_model"
              name="default_model"
              value={selected}
              onChange={handleChange}
              style={SELECT_STYLE}
              onFocus={(e) => {
                (e.target as HTMLSelectElement).style.borderColor = 'var(--accent)';
              }}
              onBlur={(e) => {
                (e.target as HTMLSelectElement).style.borderColor = 'var(--rule)';
              }}
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={isPending || !dirty}
              style={{
                ...SAVE_BTN_BASE,
                opacity: isPending || !dirty ? 0.5 : 1,
                cursor: isPending || !dirty ? 'default' : 'pointer',
              }}
            >
              {isPending && (
                <Loader2
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              {isPending ? 'Saving…' : 'Save Model'}
            </button>
            <StatusPill savedAt={savedAt} />
          </div>
        </form>
      </div>
    </section>
  );
}

// ─── Section 3: Note Sources ──────────────────────────────────────────────────

function NoteSourcesSection() {
  const { data: existingWorkvault } = useSetting('workvault_root');
  const { data: existingOnedrive }  = useSetting('onedrive_root');
  const setSetting = useSetSetting();

  const [workvault, setWorkvault] = useState('');
  const [onedrive,  setOnedrive]  = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ workvault?: string; onedrive?: string }>({});

  const workvaultRef = useRef<HTMLInputElement>(null);
  const onedriveRef  = useRef<HTMLInputElement>(null);

  useBeforeUnloadGuard(dirty);

  // Sync once queries resolve
  useEffect(() => {
    if (existingWorkvault?.value && !dirty) {
      setWorkvault(existingWorkvault.value);
    }
  }, [existingWorkvault?.value, dirty]);

  useEffect(() => {
    if (existingOnedrive?.value && !dirty) {
      setOnedrive(existingOnedrive.value);
    }
  }, [existingOnedrive?.value, dirty]);

  function handleWorkvaultChange(e: ChangeEvent<HTMLInputElement>) {
    setWorkvault(e.target.value);
    setDirty(true);
    setErrors((prev) => ({ ...prev, workvault: undefined }));
  }

  function handleOnedriveChange(e: ChangeEvent<HTMLInputElement>) {
    setOnedrive(e.target.value);
    setDirty(true);
    setErrors((prev) => ({ ...prev, onedrive: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const newErrors: { workvault?: string; onedrive?: string } = {};

    if (!workvault.trim()) {
      newErrors.workvault = 'WorkVault root path is required.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (newErrors.workvault) workvaultRef.current?.focus();
      else if (newErrors.onedrive) onedriveRef.current?.focus();
      return;
    }

    setErrors({});
    try {
      // Fire both mutations in sequence; show one combined confirmation
      await setSetting.mutateAsync({ key: 'workvault_root', value: workvault.trim() });
      if (onedrive.trim()) {
        await setSetting.mutateAsync({ key: 'onedrive_root', value: onedrive.trim() });
      }
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      setErrors({
        workvault: err instanceof Error ? err.message : 'Save failed. Try again.',
      });
    }
  }

  const isPending = setSetting.isPending;

  return (
    <section aria-labelledby="section-note-sources">
      <h2 id="section-note-sources" style={SECTION_TITLE_STYLE}>
        Note Sources
      </h2>
      <div style={CARD_STYLE}>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <FormField
              id="workvault_root"
              label="WorkVault root"
              error={errors.workvault}
              helper="Read-only until Phase 2 ingestion. MasterControl will scan this folder to import and tag notes by org."
            >
              <input
                id="workvault_root"
                ref={workvaultRef}
                type="text"
                name="workvault_root"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  existingWorkvault?.value ??
                  'C:\\Users\\schmichr\\OneDrive - WWT\\Documents\\redqueen\\WorkVault'
                }
                value={workvault}
                onChange={handleWorkvaultChange}
                className="mono"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = 'var(--accent)';
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = 'var(--rule)';
                }}
              />
            </FormField>

            <FormField
              id="onedrive_root"
              label="OneDrive root"
              error={errors.onedrive}
              helper="Used by the OEM page to list project documents from your OneDrive folder in Phase 2."
            >
              <input
                id="onedrive_root"
                ref={onedriveRef}
                type="text"
                name="onedrive_root"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={existingOnedrive?.value ?? 'C:\\Users\\schmichr\\OneDrive - WWT'}
                value={onedrive}
                onChange={handleOnedriveChange}
                className="mono"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = 'var(--accent)';
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = 'var(--rule)';
                }}
              />
            </FormField>
          </div>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={isPending || !dirty}
              style={{
                ...SAVE_BTN_BASE,
                opacity: isPending || !dirty ? 0.5 : 1,
                cursor: isPending || !dirty ? 'default' : 'pointer',
              }}
            >
              {isPending && (
                <Loader2
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              {isPending ? 'Saving…' : 'Save Paths'}
            </button>
            <StatusPill savedAt={savedAt} />
          </div>
        </form>
      </div>
    </section>
  );
}

// ─── Section 4: Background Scheduler ─────────────────────────────────────────

function SchedulerSection() {
  return (
    <section aria-labelledby="section-scheduler">
      <h2 id="section-scheduler" style={SECTION_TITLE_STYLE}>
        Background Scheduler
      </h2>
      <div style={CARD_STYLE}>
        <dl
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            margin: 0,
          }}
        >
          {(
            [
              ['Status',   'Not configured (Phase 2)'],
              ['Next run', '—'],
              ['Last run', '—'],
            ] as const
          ).map(([term, detail]) => (
            <div key={term} style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
              <dt
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--ink-2)',
                  minWidth: 80,
                  flexShrink: 0,
                }}
              >
                {term}
              </dt>
              <dd
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 14,
                  color: 'var(--ink-1)',
                  margin: 0,
                }}
              >
                {detail}
              </dd>
            </div>
          ))}
        </dl>
        <p
          style={{
            marginTop: 20,
            fontSize: 12,
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            lineHeight: 1.5,
          }}
        >
          Scheduled reports run via the Phase 2 Windows Service. Configure
          when reports launch.
        </p>
      </div>
    </section>
  );
}

// ─── Section 5: Agent Overrides ───────────────────────────────────────────────

function AgentOverridesSection() {
  return (
    <section aria-labelledby="section-agent-overrides">
      <h2 id="section-agent-overrides" style={SECTION_TITLE_STYLE}>
        Agent Overrides
      </h2>
      <div style={CARD_STYLE}>
        <p
          style={{
            fontFamily: 'var(--body)',
            fontSize: 14,
            color: 'var(--ink-2)',
            lineHeight: 1.6,
          }}
        >
          Per-section system-prompt templates and per-org overrides live in{' '}
          <NavLink
            to="/agents"
            style={({ isActive }) => ({
              color: isActive ? 'var(--accent)' : 'var(--ink-1)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              fontFamily: 'var(--body)',
              fontSize: 14,
            })}
          >
            Agents
          </NavLink>
          .
        </p>
      </div>
    </section>
  );
}

// ─── beforeunload guard ────────────────────────────────────────────────────────

/**
 * Attaches a beforeunload listener while isDirty is true.
 * Called directly by each form section so the guard is scoped to that section.
 */
function useBeforeUnloadGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern spec: returnValue must be set (even empty string) to show dialog
      e.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  return (
    <div style={{ maxWidth: 640 }}>
      {/* Page header — matches CustomerPage convention */}
      <p
        style={{
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontWeight: 500,
          marginBottom: 8,
          fontFamily: 'var(--body)',
        }}
      >
        Settings
      </p>
      <h1
        style={{
          fontFamily: 'var(--display)',
          fontSize: 56,
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          marginLeft: -3,
          marginBottom: 8,
          textWrap: 'balance' as React.CSSProperties['textWrap'],
        }}
      >
        Settings
      </h1>
      <p
        style={{
          color: 'var(--ink-2)',
          fontSize: 15,
          fontFamily: 'var(--body)',
          marginBottom: 40,
          lineHeight: 1.5,
        }}
      >
        Per-app preferences and credentials
      </p>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        <ApiKeySection />
        <DefaultModelSection />
        <NoteSourcesSection />
        <SchedulerSection />
        <AgentOverridesSection />
      </div>
    </div>
  );
}
