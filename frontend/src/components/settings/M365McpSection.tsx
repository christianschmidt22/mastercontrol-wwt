/**
 * M365McpSection — settings card for the Anthropic-managed M365 MCP connector.
 *
 * Matches the visual pattern established in SettingsPage.tsx (Field Notes
 * aesthetic, DESIGN.md). Each field has an explicit label for a11y.
 *
 * Fields:
 *   - MCP Server URL   — plaintext, full width
 *   - Authorization Token — password input; blank on edit means "keep existing"
 *   - Enabled toggle
 *   - Test Connection button — POST /api/m365/test
 */

import { type ChangeEvent, type CSSProperties, useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useSetting, useSetSetting } from '../../api/useSettings';

// ─── Style tokens (mirrors SettingsPage.tsx) ─────────────────────────────────

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

// ─── TestStatus ───────────────────────────────────────────────────────────────

type TestState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; response: string }
  | { kind: 'error'; message: string };

// ─── M365McpSection ───────────────────────────────────────────────────────────

export function M365McpSection() {
  const { data: urlData } = useSetting('m365_mcp_url');
  const { data: tokenData } = useSetting('m365_mcp_token');
  const { data: enabledData } = useSetting('m365_mcp_enabled');
  const { data: nameData } = useSetting('m365_mcp_name');
  const setSetting = useSetSetting();

  const [urlDraft, setUrlDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  // Sync from server state once loaded.
  useEffect(() => {
    if (urlData?.value !== undefined) setUrlDraft(urlData.value);
  }, [urlData?.value]);

  useEffect(() => {
    // Token is masked (***last4) so we don't prefill the draft.
    // If the user leaves it blank, we skip the save so the existing value
    // is preserved.
    void tokenData; // read to trigger query; we intentionally don't prefill
  }, [tokenData]);

  useEffect(() => {
    if (enabledData?.value !== undefined) {
      setEnabled(enabledData.value === '1' || enabledData.value === 'true');
    }
  }, [enabledData?.value]);

  const isSaving = setSetting.isPending;

  async function handleSave() {
    const saves: Promise<void>[] = [
      setSetting.mutateAsync({ key: 'm365_mcp_url', value: urlDraft.trim() }),
      setSetting.mutateAsync({ key: 'm365_mcp_enabled', value: enabled ? '1' : '0' }),
    ];
    // Only save token if the user typed something new.
    if (tokenDraft.trim()) {
      saves.push(setSetting.mutateAsync({ key: 'm365_mcp_token', value: tokenDraft.trim() }));
    }
    if (nameData?.value === undefined) {
      saves.push(setSetting.mutateAsync({ key: 'm365_mcp_name', value: 'm365' }));
    }
    await Promise.all(saves);
    setTokenDraft('');
    setSavedAt(Date.now());
  }

  async function handleTest() {
    setTestState({ kind: 'loading' });
    try {
      const res = await fetch('/api/m365/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { ok?: boolean; response?: string; error?: string };
      if (data.ok) {
        setTestState({ kind: 'ok', response: data.response ?? 'Connected' });
      } else {
        setTestState({ kind: 'error', message: data.error ?? 'Test failed' });
      }
    } catch (err) {
      setTestState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Test failed',
      });
    }
  }

  const isDirty =
    (urlData?.value ?? '') !== urlDraft.trim() ||
    tokenDraft.trim().length > 0 ||
    (enabledData?.value === '1') !== enabled;

  return (
    <section aria-labelledby="section-m365-mcp">
      <h2 id="section-m365-mcp" style={SECTION_H2}>
        Microsoft 365 Connector
      </h2>

      <div style={CARD_STYLE}>
        <p style={{ ...HELPER_STYLE, margin: '0 0 20px' }}>
          Connect to your Anthropic-managed Microsoft 365 MCP connector. Get the URL and
          token from your Anthropic account's connector settings. When enabled, per-org
          chat agents can search your M365 data (email, calendar, SharePoint, Teams).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* MCP Server URL */}
          <div>
            <label htmlFor="m365_mcp_url" style={LABEL_STYLE}>
              MCP Server URL
            </label>
            <input
              id="m365_mcp_url"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://mcp.anthropic.com/…"
              value={urlDraft}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUrlDraft(e.target.value)}
              disabled={isSaving}
              style={INPUT_STYLE}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--rule)'; }}
            />
          </div>

          {/* Authorization Token */}
          <div>
            <label htmlFor="m365_mcp_token" style={LABEL_STYLE}>
              Authorization Token
            </label>
            <input
              id="m365_mcp_token"
              ref={tokenRef}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={
                tokenData?.value && tokenData.value !== '—'
                  ? '••••••••  (leave blank to keep existing)'
                  : 'Paste token from Anthropic connector settings'
              }
              value={tokenDraft}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTokenDraft(e.target.value)}
              disabled={isSaving}
              style={INPUT_STYLE}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--rule)'; }}
            />
            <p style={HELPER_STYLE}>
              Stored encrypted via Windows DPAPI. Leave blank to keep the existing token.
            </p>
          </div>

          {/* Enabled toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              id="m365_mcp_enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEnabled(e.target.checked)}
              disabled={isSaving}
              style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer' }}
            />
            <label
              htmlFor="m365_mcp_enabled"
              style={{
                fontFamily: 'var(--body)',
                fontSize: 14,
                color: 'var(--ink-1)',
                cursor: 'pointer',
              }}
            >
              Enable M365 connector for per-org agents
            </label>
          </div>
        </div>

        {/* Action row */}
        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Save */}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isDirty || isSaving}
            style={{
              fontFamily: 'var(--body)',
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 18px',
              borderRadius: 6,
              cursor: !isDirty || isSaving ? 'default' : 'pointer',
              border: `1px solid ${isDirty ? 'var(--accent)' : 'var(--rule)'}`,
              background: 'var(--bg)',
              color: isDirty ? 'var(--accent)' : 'var(--ink-2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'border-color 150ms var(--ease), color 150ms var(--ease)',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving && (
              <Loader2 size={14} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />
            )}
            {isSaving ? 'Saving…' : 'Save'}
          </button>

          {/* Test Connection */}
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testState.kind === 'loading'}
            aria-label="Test M365 MCP connection"
            style={{
              fontFamily: 'var(--body)',
              fontSize: 13,
              fontWeight: 400,
              padding: '8px 16px',
              borderRadius: 6,
              cursor: testState.kind === 'loading' ? 'default' : 'pointer',
              border: '1px solid var(--rule)',
              background: 'transparent',
              color: 'var(--ink-2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'color 150ms var(--ease)',
            }}
          >
            {testState.kind === 'loading' && (
              <Loader2 size={14} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />
            )}
            {testState.kind === 'loading' ? 'Testing…' : 'Test Connection'}
          </button>

          {/* Saved badge */}
          {savedAt !== null && (
            <span
              aria-live="polite"
              style={{
                fontFamily: 'var(--body)',
                fontSize: 12,
                color: 'var(--ink-2)',
              }}
            >
              Saved
            </span>
          )}
        </div>

        {/* Test result */}
        {testState.kind === 'ok' && (
          <div
            role="status"
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontFamily: 'var(--body)',
              fontSize: 13,
              color: 'var(--ink-1)',
            }}
          >
            <CheckCircle
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }}
            />
            <span>{testState.response}</span>
          </div>
        )}
        {testState.kind === 'error' && (
          <div
            role="alert"
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontFamily: 'var(--body)',
              fontSize: 13,
              color: 'var(--accent)',
            }}
          >
            <XCircle
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              style={{ flexShrink: 0, marginTop: 1 }}
            />
            <span>{testState.message}</span>
          </div>
        )}
      </div>
    </section>
  );
}
