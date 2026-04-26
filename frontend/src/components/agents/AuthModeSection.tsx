/**
 * AuthModeSection.tsx
 *
 * Delegation Authentication section for SettingsPage.
 * Two modes side-by-side:
 *   1. Subscription login  — OAuth via `claude /login`, reads credentials.json
 *   2. API key (fallback)  — personal_anthropic_api_key from Settings
 *
 * Design: DESIGN.md "Field Notes" palette. Hairlines, no shadows.
 * A11y: aria-live on status pill, labelled inputs, focus-visible rings.
 */

import {
  type FormEvent,
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { useSetting, useSetSetting } from '../../api/useSettings';
import { useAuthStatus, subagentKeys } from '../../api/useSubagent';
import { FormField } from '../forms/FormField';

// ─── Shared style tokens (mirrors SettingsPage) ───────────────────────────────

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

const BTN_BASE: React.CSSProperties = {
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
  transition: 'opacity 150ms var(--ease)',
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--display)',
  fontWeight: 500,
  fontSize: 24,
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  color: 'var(--ink-1)',
  marginBottom: 16,
  textWrap: 'balance',
};

// ─── Status pill for "Saved" confirmation ──────────────────────────────────────

function SavedPill({ savedAt }: { savedAt: number | null }) {
  const [label, setLabel] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (savedAt === null) { setVisible(false); return; }
    setVisible(true);
    setLabel('Saved');
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <span
      aria-live="polite"
      style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--body)', opacity: visible ? 1 : 0, transition: 'opacity 240ms var(--ease)' }}
    >
      {label}
    </span>
  );
}

// ─── Subscription login card ──────────────────────────────────────────────────

function SubscriptionCard() {
  const { data: status, isLoading } = useAuthStatus();
  const qc = useQueryClient();

  const isAuthenticated = status?.subscription_authenticated;
  const isUnknown = status === null || status === undefined;

  function handleRecheck() {
    void qc.invalidateQueries({ queryKey: subagentKeys.authStatus() });
  }

  return (
    <div
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 8,
        padding: '20px 24px',
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, fontFamily: 'var(--body)', color: 'var(--ink-1)' }}>
        Subscription login
      </p>
      <p style={{ margin: 0, fontSize: 13, fontFamily: 'var(--body)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
        Uses your Claude.ai subscription (Pro/Max/Team) via the Agent SDK.
        Usage counts against your subscription allotment, not metered tokens.
      </p>

      {/* Status pill */}
      <span
        aria-live="polite"
        role="status"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontFamily: 'var(--body)',
          fontWeight: 500,
          padding: '4px 10px',
          borderRadius: 20,
          border: '1px solid var(--rule)',
          background: 'var(--bg-2)',
          color: isLoading ? 'var(--ink-3)' : isUnknown ? 'var(--ink-2)' : isAuthenticated ? 'var(--ink-1)' : 'var(--ink-2)',
          width: 'fit-content',
        }}
      >
        {/* Dot */}
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isLoading ? 'var(--ink-3)' : isUnknown ? 'var(--ink-3)' : isAuthenticated ? '#4caf50' : 'var(--ink-3)',
            flexShrink: 0,
          }}
        />
        {isLoading
          ? 'Checking…'
          : isUnknown
          ? 'Status unknown — try delegating to verify'
          : isAuthenticated
          ? 'Authenticated'
          : 'Not authenticated — run claude /login'}
      </span>

      {/* Instructions when not authenticated */}
      {!isLoading && !isAuthenticated && (
        <p style={{ margin: 0, fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Run <code style={{ fontSize: 12, color: 'var(--ink-1)', background: 'var(--bg-2)', border: '1px solid var(--rule)', borderRadius: 4, padding: '1px 6px' }}>claude /login</code> from a terminal to authorize MasterControl, then click Re-check.
        </p>
      )}

      <button
        type="button"
        onClick={handleRecheck}
        disabled={isLoading}
        aria-label="Re-check subscription authentication status"
        style={{
          ...BTN_BASE,
          padding: '6px 14px',
          fontSize: 12,
          opacity: isLoading ? 0.5 : 1,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          width: 'fit-content',
        }}
      >
        <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" />
        Re-check status
      </button>
    </div>
  );
}

// ─── API key card ─────────────────────────────────────────────────────────────

function ApiKeyCard() {
  const { data: existing } = useSetting('personal_anthropic_api_key');
  const setSetting = useSetSetting();
  const [value, setValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
      await setSetting.mutateAsync({ key: 'personal_anthropic_api_key', value: value.trim() });
      setValue('');
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed. Try again.');
    }
  }

  const isPending = setSetting.isPending;

  return (
    <div
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 8,
        padding: '20px 24px',
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, fontFamily: 'var(--body)', color: 'var(--ink-1)' }}>
        API key (fallback)
      </p>
      <p style={{ margin: 0, fontSize: 13, fontFamily: 'var(--body)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
        When to use this: only if you don't have a Claude.ai subscription, or want to bill per-token instead of subscription quota.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <FormField
          id="personal_anthropic_api_key"
          label="Personal Anthropic API key"
          helper={existing?.value ? `Current: ${existing.value}` : 'Enter your sk-ant-… key to enable API-key delegation.'}
          error={error}
        >
          <input
            id="personal_anthropic_api_key"
            ref={inputRef}
            type="password"
            autoComplete="off"
            spellCheck={false}
            name="personal_anthropic_api_key"
            placeholder={existing?.value ?? 'sk-ant-…'}
            value={value}
            onChange={handleChange}
            aria-describedby={error ? 'personal_anthropic_api_key-error' : 'personal_anthropic_api_key-helper'}
            style={{
              ...INPUT_STYLE,
              borderColor: error ? 'var(--accent)' : 'var(--rule)',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.target.style.borderColor = error ? 'var(--accent)' : 'var(--rule)'; }}
          />
        </FormField>

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="submit"
            disabled={isPending || !dirty}
            style={{
              ...BTN_BASE,
              opacity: isPending || !dirty ? 0.5 : 1,
              cursor: isPending || !dirty ? 'default' : 'pointer',
            }}
          >
            {isPending && <Loader2 size={14} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />}
            {isPending ? 'Saving…' : 'Save Key'}
          </button>
          <SavedPill savedAt={savedAt} />
        </div>
      </form>
    </div>
  );
}

// ─── Public section ───────────────────────────────────────────────────────────

export function AuthModeSection() {
  return (
    <section aria-labelledby="section-delegation-auth">
      <h2 id="section-delegation-auth" style={SECTION_TITLE_STYLE}>
        Delegation Authentication
      </h2>
      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'stretch',
        }}
      >
        <SubscriptionCard />
        <ApiKeyCard />
      </div>
    </section>
  );
}
