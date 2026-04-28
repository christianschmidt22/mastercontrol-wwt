/**
 * SettingsPage — Phase 1
 *
 * Sections:
 *   1. Anthropic API Key          — masked display, Edit toggle, Save / Cancel
 *   2. Delegation Authentication  — subscription-login status + API-key fallback
 *                                   (rendered via AuthModeSection)
 *   3. Default Model              — <select>, saves immediately on change
 *   4. Theme                      — Light / Dark / System radios, syncs Zustand + DOM + backend
 *   5. Paths                      — editable WorkVault + OneDrive roots
 *
 * Design: DESIGN.md "Field Notes" aesthetic. Fraunces h1/h2, Switzer body.
 * A11y: explicit <label htmlFor> on every input, <fieldset>/<legend> for radios,
 *       aria-live on save confirmation, focus-visible rings, disabled attr when not dirty.
 */

import { type ChangeEvent, type CSSProperties, useEffect, useRef, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { useSetting, useSetSetting } from '../api/useSettings';
import { useAuthStatus } from '../api/useSubagent';
import { useUiStore, type Theme } from '../store/useUiStore';
import { AuthModeSection } from '../components/agents/AuthModeSection';

// ─── Style tokens ──────────────────────────────────────────────────────────────

const INPUT_STYLE: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 14,
  color: 'var(--ink-1)',
  background: 'var(--bg)',
  border: '1px solid var(--rule)',
  borderRadius: 6,
  padding: '8px 12px',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 150ms var(--ease)',
};

const CARD_STYLE: CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 8,
  padding: 32,
  background: 'var(--bg)',
};

const SECTION_H2: CSSProperties = {
  fontFamily: 'var(--display)',
  fontWeight: 500,
  fontSize: 22,
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  color: 'var(--ink-1)',
  margin: '0 0 16px',
};

const LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--ink-1)',
  letterSpacing: '0.01em',
  display: 'block',
  marginBottom: 6,
};

const HELPER_STYLE: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 12,
  color: 'var(--ink-2)',
  lineHeight: 1.5,
  margin: '6px 0 0',
};

const ERROR_STYLE: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 12,
  color: 'var(--accent)',
  lineHeight: 1.5,
  margin: '6px 0 0',
};

// ─── useBeforeUnloadGuard ─────────────────────────────────────────────────────

function useBeforeUnloadGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    function handle(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handle);
    return () => window.removeEventListener('beforeunload', handle);
  }, [isDirty]);
}

// ─── SavedBadge ───────────────────────────────────────────────────────────────

function SavedBadge({ savedAt }: { savedAt: number | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (savedAt === null) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <span
      aria-live="polite"
      style={{
        fontFamily: 'var(--body)',
        fontSize: 12,
        color: 'var(--ink-2)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 240ms var(--ease)',
        minHeight: 18,
        display: 'inline-block',
      }}
    >
      Saved
    </span>
  );
}

// ─── MaskedKeySection ─────────────────────────────────────────────────────────
// Reused for both Anthropic API Key and Personal Anthropic API Key sections.

interface MaskedKeySectionProps {
  settingKey: string;
  sectionId: string;
  title: string;
  inputId: string;
  helperText: string;
  saveLabel: string;
}

function MaskedKeySection({
  settingKey,
  sectionId,
  title,
  inputId,
  helperText,
  saveLabel,
}: MaskedKeySectionProps) {
  const { data: existing } = useSetting(settingKey);
  const setSetting = useSetSetting();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dirty = editing && draft.trim() !== '';
  const isPending = setSetting.isPending;

  useBeforeUnloadGuard(dirty);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const maskedValue = existing?.value ?? '—';

  function startEditing() {
    setDraft('');
    setError('');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setDraft('');
    setError('');
  }

  async function handleSave() {
    if (!draft.trim()) {
      setError('API key is required.');
      inputRef.current?.focus();
      return;
    }
    setError('');
    try {
      await setSetting.mutateAsync({ key: settingKey, value: draft.trim() });
      setEditing(false);
      setDraft('');
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed. Try again.');
    }
  }

  return (
    <section aria-labelledby={sectionId}>
      <h2 id={sectionId} style={SECTION_H2}>
        {title}
      </h2>

      <div style={CARD_STYLE}>
        {!editing ? (
          /* ── Display mode ──────────────────────────────────────────── */
          <div>
            <label htmlFor={inputId} style={LABEL_STYLE}>
              {title}
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id={inputId}
                type="text"
                readOnly
                value={maskedValue}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  color: 'var(--ink-2)',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--rule)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  flex: '1 1 0',
                  minWidth: 0,
                  cursor: 'default',
                }}
              />
              <button
                type="button"
                onClick={startEditing}
                aria-label={`Edit ${title}`}
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '8px 16px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: '1px solid var(--rule)',
                  background: 'var(--bg)',
                  color: 'var(--ink-1)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'border-color 150ms var(--ease)',
                }}
              >
                <Pencil size={13} strokeWidth={1.5} aria-hidden="true" />
                Edit
              </button>
            </div>
            <p style={HELPER_STYLE}>{helperText}</p>
            <div style={{ marginTop: 8 }}>
              <SavedBadge savedAt={savedAt} />
            </div>
          </div>
        ) : (
          /* ── Edit mode ─────────────────────────────────────────────── */
          <div>
            <label htmlFor={inputId} style={LABEL_STYLE}>
              {title}
            </label>
            <input
              id={inputId}
              ref={inputRef}
              type="password"
              autoComplete="off"
              spellCheck={false}
              name={inputId}
              placeholder="sk-ant-…"
              value={draft}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setDraft(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEditing();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              aria-describedby={error ? `${inputId}-error` : undefined}
              aria-invalid={error ? true : undefined}
              style={{
                ...INPUT_STYLE,
                borderColor: error ? 'var(--accent)' : 'var(--rule)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = error ? 'var(--accent)' : 'var(--rule)';
              }}
            />

            {error ? (
              <p id={`${inputId}-error`} role="alert" style={ERROR_STYLE}>
                {error}
              </p>
            ) : (
              <p style={HELPER_STYLE}>{helperText}</p>
            )}

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Save — vermilion border + text when dirty, per DESIGN.md vermilion budget */}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!dirty || isPending}
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '8px 18px',
                  borderRadius: 6,
                  cursor: !dirty || isPending ? 'default' : 'pointer',
                  border: `1px solid ${dirty ? 'var(--accent)' : 'var(--rule)'}`,
                  background: 'var(--bg)',
                  color: dirty ? 'var(--accent)' : 'var(--ink-2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'border-color 150ms var(--ease), color 150ms var(--ease)',
                  opacity: isPending ? 0.6 : 1,
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
                {isPending ? 'Saving…' : saveLabel}
              </button>

              {/* Cancel — hairline border only, no fill */}
              <button
                type="button"
                onClick={cancelEditing}
                disabled={isPending}
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 13,
                  fontWeight: 400,
                  padding: '8px 16px',
                  borderRadius: 6,
                  cursor: isPending ? 'default' : 'pointer',
                  border: '1px solid var(--rule)',
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  transition: 'color 150ms var(--ease)',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── DefaultModelSection ──────────────────────────────────────────────────────

type CoreAuthMode = 'auto' | 'subscription' | 'api_key';

function CoreClaudeAuthSection() {
  const { data: existing } = useSetting('claude_auth_mode');
  const { data: status } = useAuthStatus();
  const setSetting = useSetSetting();
  const [selected, setSelected] = useState<CoreAuthMode>('auto');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (
      existing?.value === 'auto' ||
      existing?.value === 'subscription' ||
      existing?.value === 'api_key'
    ) {
      setSelected(existing.value);
    }
  }, [existing?.value]);

  async function handleChange(next: CoreAuthMode) {
    setSelected(next);
    setError('');
    try {
      await setSetting.mutateAsync({ key: 'claude_auth_mode', value: next });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  const options: Array<{ value: CoreAuthMode; label: string; helper: string }> = [
    {
      value: 'subscription',
      label: 'Claude Code login',
      helper: status?.subscription_authenticated ? 'Claude Code login detected' : 'Run claude /login',
    },
    {
      value: 'auto',
      label: 'Auto',
      helper: 'Use an API key if present, otherwise use Claude Code login.',
    },
    {
      value: 'api_key',
      label: 'API key',
      helper: status?.core_api_key_configured ? 'API key configured' : 'No API key saved',
    },
  ];

  return (
    <section aria-labelledby="section-core-claude-auth">
      <h2 id="section-core-claude-auth" style={SECTION_H2}>
        Core Claude Authentication
      </h2>
      <div style={CARD_STYLE}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={LABEL_STYLE}>Authentication mode for CRM chat, extraction, and reports</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {options.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`core-auth-${opt.value}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontFamily: 'var(--body)',
                  fontSize: 14,
                  color: 'var(--ink-1)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  id={`core-auth-${opt.value}`}
                  name="claude_auth_mode"
                  value={opt.value}
                  checked={selected === opt.value}
                  onChange={() => void handleChange(opt.value)}
                  disabled={setSetting.isPending}
                  style={{ accentColor: 'var(--accent)', cursor: 'pointer', marginTop: 3 }}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>{opt.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{opt.helper}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" style={{ ...ERROR_STYLE, marginTop: 12 }}>
            {error}
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <SavedBadge savedAt={savedAt} />
        </div>
      </div>
    </section>
  );
}

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 (recommended)' },
  { value: 'claude-opus-4-7', label: 'claude-opus-4-7' },
  { value: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
] as const;

type ModelValue = (typeof MODEL_OPTIONS)[number]['value'];

function DefaultModelSection() {
  const { data: existing } = useSetting('default_model');
  const setSetting = useSetSetting();

  const [selected, setSelected] = useState<ModelValue>('claude-sonnet-4-6');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Sync local state once server response lands
  useEffect(() => {
    if (existing?.value) {
      const v = existing.value as ModelValue;
      if (MODEL_OPTIONS.some((o) => o.value === v)) setSelected(v);
    }
  }, [existing?.value]);

  async function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ModelValue;
    setSelected(next);
    setError('');
    try {
      await setSetting.mutateAsync({ key: 'default_model', value: next });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <section aria-labelledby="section-default-model">
      <h2 id="section-default-model" style={SECTION_H2}>
        Default Model
      </h2>
      <div style={CARD_STYLE}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="default_model" style={LABEL_STYLE}>
            Model
          </label>
          <select
            id="default_model"
            name="default_model"
            value={selected}
            onChange={(e) => void handleChange(e)}
            disabled={setSetting.isPending}
            style={{
              ...INPUT_STYLE,
              backgroundColor: 'var(--bg)',
              color: 'var(--ink-1)',
              appearance: 'auto',
              cursor: setSetting.isPending ? 'wait' : 'pointer',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--accent)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--rule)';
            }}
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p style={HELPER_STYLE}>Saves immediately. Applied to all new agent conversations.</p>
          {error && (
            <p role="alert" style={ERROR_STYLE}>
              {error}
            </p>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <SavedBadge savedAt={savedAt} />
        </div>
      </div>
    </section>
  );
}

// ─── ThemeSection ─────────────────────────────────────────────────────────────

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/**
 * Apply theme class to document root synchronously.
 * 'system' removes both classes, deferring to prefers-color-scheme.
 */
export function applyThemeToDocument(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (theme === 'light') root.classList.add('light');
  else if (theme === 'dark') root.classList.add('dark');
}

function ThemeSection() {
  const { theme, setTheme } = useUiStore();
  const setSetting = useSetSetting();
  const [error, setError] = useState('');

  async function handleChange(next: Theme) {
    // Synchronous: update Zustand (persists to localStorage) + DOM class
    setTheme(next);
    applyThemeToDocument(next);
    setError('');
    // Async: persist to backend settings for cross-device / settings-page restore
    try {
      await setSetting.mutateAsync({ key: 'theme', value: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <section aria-labelledby="section-theme">
      <h2 id="section-theme" style={SECTION_H2}>
        Theme
      </h2>
      <div style={CARD_STYLE}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={LABEL_STYLE}>Color scheme</legend>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 2 }}>
            {THEME_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`theme-${opt.value}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: 'var(--body)',
                  fontSize: 14,
                  color: 'var(--ink-1)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  id={`theme-${opt.value}`}
                  name="theme"
                  value={opt.value}
                  checked={theme === opt.value}
                  onChange={() => void handleChange(opt.value)}
                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" style={{ ...ERROR_STYLE, marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

// ─── PathsSection ─────────────────────────────────────────────────────────────

function PathsSection() {
  const defaultMastercontrolRoot =
    'C:\\Users\\schmichr\\OneDrive - WWT\\Documents\\mastercontrol';
  const { data: mastercontrolData } = useSetting('mastercontrol_root');
  const { data: workvaultData } = useSetting('workvault_root');
  const { data: onedriveData } = useSetting('onedrive_root');
  const setSetting = useSetSetting();
  const [mastercontrolDraft, setMastercontrolDraft] = useState('');
  const [workvaultDraft, setWorkvaultDraft] = useState('');
  const [onedriveDraft, setOnedriveDraft] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setMastercontrolDraft(mastercontrolData?.value ?? defaultMastercontrolRoot);
  }, [mastercontrolData?.value]);

  useEffect(() => {
    setWorkvaultDraft(workvaultData?.value ?? '');
  }, [workvaultData?.value]);

  useEffect(() => {
    setOnedriveDraft(onedriveData?.value ?? '');
  }, [onedriveData?.value]);

  async function savePath(
    key: 'mastercontrol_root' | 'workvault_root' | 'onedrive_root',
    value: string,
  ) {
    if (!value.trim()) return;
    await setSetting.mutateAsync({ key, value: value.trim() });
    setSavedAt(Date.now());
  }

  const pathInputStyle: CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 13,
    color: 'var(--ink-2)',
    background: 'var(--bg-2)',
    border: '1px solid var(--rule)',
    borderRadius: 6,
    padding: '8px 12px',
    width: '100%',
    boxSizing: 'border-box',
  };
  const pathButtonStyle = (dirty: boolean): CSSProperties => ({
    alignSelf: 'flex-start',
    fontFamily: 'var(--body)',
    fontSize: 13,
    fontWeight: 500,
    padding: '7px 16px',
    borderRadius: 6,
    border: `1px solid ${dirty ? 'var(--accent)' : 'var(--rule)'}`,
    background: 'var(--bg)',
    color: dirty ? 'var(--accent)' : 'var(--ink-2)',
    cursor: dirty && !setSetting.isPending ? 'pointer' : 'default',
    opacity: setSetting.isPending ? 0.6 : 1,
  });

  // Never-saved state: mastercontrolData?.value is undefined, so the draft
  // always matches the displayed default. Treat any non-empty draft as dirty
  // when the setting has never been explicitly saved.
  const mastercontrolDirty =
    mastercontrolData?.value === undefined
      ? mastercontrolDraft.trim().length > 0
      : mastercontrolDraft.trim() !== mastercontrolData.value;
  const workvaultDirty = workvaultDraft.trim() !== (workvaultData?.value ?? '');
  const onedriveDirty = onedriveDraft.trim() !== (onedriveData?.value ?? '');

  return (
    <section aria-labelledby="section-paths">
      <h2 id="section-paths" style={SECTION_H2}>
        Paths
      </h2>
      <div style={CARD_STYLE}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="mastercontrol_root" style={LABEL_STYLE}>
              MasterControl Files
            </label>
            <input
              id="mastercontrol_root"
              type="text"
              value={mastercontrolDraft}
              onChange={(e) => { setMastercontrolDraft(e.target.value); }}
              style={pathInputStyle}
            />
            <button
              type="button"
              aria-label="Save MasterControl files path"
              onClick={() => { void savePath('mastercontrol_root', mastercontrolDraft); }}
              disabled={!mastercontrolDirty || setSetting.isPending}
              style={pathButtonStyle(mastercontrolDirty)}
            >
              {setSetting.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="workvault_root" style={LABEL_STYLE}>
              WorkVault
            </label>
            <input
              id="workvault_root"
              type="text"
              value={workvaultDraft}
              onChange={(e) => { setWorkvaultDraft(e.target.value); }}
              style={pathInputStyle}
            />
            <button
              type="button"
              aria-label="Save WorkVault path"
              onClick={() => { void savePath('workvault_root', workvaultDraft); }}
              disabled={!workvaultDirty || setSetting.isPending}
              style={pathButtonStyle(workvaultDirty)}
            >
              {setSetting.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="onedrive_root" style={LABEL_STYLE}>
              OneDrive
            </label>
            <input
              id="onedrive_root"
              type="text"
              value={onedriveDraft}
              onChange={(e) => { setOnedriveDraft(e.target.value); }}
              style={pathInputStyle}
            />
            <button
              type="button"
              aria-label="Save OneDrive path"
              onClick={() => { void savePath('onedrive_root', onedriveDraft); }}
              disabled={!onedriveDirty || setSetting.isPending}
              style={pathButtonStyle(onedriveDirty)}
            >
              {setSetting.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <SavedBadge savedAt={savedAt} />
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  return (
    <div style={{ maxWidth: 640 }}>
      {/* Eyebrow — matches CustomerPageHeader convention */}
      <p
        style={{
          fontFamily: 'var(--body)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          margin: '0 0 8px',
        }}
      >
        Settings
      </p>

      {/* h1 — Fraunces 56px, slight left hang per DESIGN.md */}
      <h1
        style={{
          fontFamily: 'var(--display)',
          fontSize: 56,
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          margin: '0 0 8px -3px',
          color: 'var(--ink-1)',
        }}
      >
        Settings
      </h1>

      {/* Hairline divider */}
      <div
        aria-hidden="true"
        style={{ height: 1, background: 'var(--rule)', margin: '20px 0 32px' }}
      />

      {/* Sections — 40px gap */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        <CoreClaudeAuthSection />

        <MaskedKeySection
          settingKey="anthropic_api_key"
          sectionId="section-anthropic-api-key"
          title="Anthropic API Key"
          inputId="anthropic_api_key"
          helperText="Stored encrypted via Windows DPAPI. Never logged. Never returned in plaintext from the server."
          saveLabel="Save API Key"
        />

        <AuthModeSection />

        <DefaultModelSection />

        <ThemeSection />

        <PathsSection />
      </div>
    </div>
  );
}
