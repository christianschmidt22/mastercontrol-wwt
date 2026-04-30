import { type ChangeEvent, type CSSProperties, useEffect, useState } from 'react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useSetSetting, useSetting } from '../../api/useSettings';

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

const HELPER_STYLE: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 12,
  color: 'var(--ink-2)',
  lineHeight: 1.5,
  margin: '6px 0 0',
};

type TestState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; response: string }
  | { kind: 'error'; message: string };

export function M365McpSection() {
  const { data: enabledData } = useSetting('m365_mcp_enabled');
  const { data: nameData } = useSetting('m365_mcp_name');
  const setSetting = useSetSetting();

  const [enabled, setEnabled] = useState(false);
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (enabledData?.value !== undefined) {
      setEnabled(enabledData.value === '1' || enabledData.value === 'true');
    }
  }, [enabledData?.value]);

  const isSaving = setSetting.isPending;
  const isDirty = (enabledData?.value === '1') !== enabled;

  async function handleSave() {
    const saves = [
      setSetting.mutateAsync({ key: 'm365_mcp_enabled', value: enabled ? '1' : '0' }),
    ];
    if (nameData?.value === undefined) {
      saves.push(setSetting.mutateAsync({ key: 'm365_mcp_name', value: 'm365' }));
    }
    await Promise.all(saves);
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

  return (
    <section aria-labelledby="section-m365-mcp">
      <h2 id="section-m365-mcp" style={SECTION_H2}>
        Microsoft 365 Connector
      </h2>

      <div style={CARD_STYLE}>
        <p style={{ ...HELPER_STYLE, margin: '0 0 20px' }}>
          Use the Microsoft 365 connector from your Claude Code enterprise login.
          No Anthropic API key or connector token is required. When enabled,
          per-org chat agents can search M365 data through Claude Code.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

          <p style={{ ...HELPER_STYLE, margin: 0 }}>
            Test Connection checks the Claude Code enterprise connector named
            "claude.ai Microsoft 365" and reports if Microsoft 365 still needs
            authentication.
          </p>
        </div>

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testState.kind === 'loading'}
            aria-label="Test M365 connector"
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
            {testState.kind === 'loading' ? 'Testing...' : 'Test Connection'}
          </button>

          {savedAt !== null && (
            <span aria-live="polite" style={{ fontFamily: 'var(--body)', fontSize: 12, color: 'var(--ink-2)' }}>
              Saved
            </span>
          )}
        </div>

        {testState.kind === 'ok' && (
          <div role="status" style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'var(--body)', fontSize: 13, color: 'var(--ink-1)' }}>
            <CheckCircle size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
            <span>{testState.response}</span>
          </div>
        )}
        {testState.kind === 'error' && (
          <div role="alert" style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'var(--body)', fontSize: 13, color: 'var(--accent)' }}>
            <XCircle size={16} strokeWidth={1.5} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{testState.message}</span>
          </div>
        )}
      </div>
    </section>
  );
}
