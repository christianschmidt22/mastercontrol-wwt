/**
 * DelegateConsole.tsx
 *
 * UI for submitting an agentic delegation task and viewing the full
 * transcript once the run completes. Streaming is not in scope — the
 * backend returns the complete transcript at the end of the run.
 *
 * Component budget: ~200 lines. Heavy transcript rendering is in
 * DelegateConsoleTranscript.tsx.
 */

import { useState } from 'react';
import {
  useDelegateAgentic,
  useDelegateAgenticSdk,
  useAuthStatus,
  useUsage,
} from '../../api/useSubagent';
import { useSetting } from '../../api/useSettings';
import type { DelegateTool, AgenticResult, TranscriptEntry, DelegateAuthMode } from '../../types/subagent';
import { DelegateConsoleTranscript } from './DelegateConsoleTranscript';

// ---------------------------------------------------------------------------
// Auth-mode persistence helpers
// ---------------------------------------------------------------------------

const AUTH_MODE_KEY = 'mc.delegate.authMode';

function readStoredMode(): DelegateAuthMode {
  try {
    const v = localStorage.getItem(AUTH_MODE_KEY);
    if (v === 'api-key') return 'api-key';
  } catch { /* ignore */ }
  return 'subscription'; // default
}

function writeStoredMode(mode: DelegateAuthMode) {
  try {
    localStorage.setItem(AUTH_MODE_KEY, mode);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Tool definitions with descriptions
// ---------------------------------------------------------------------------

const TOOL_DEFS: { key: DelegateTool; label: string; desc: string; defaultOn: boolean }[] = [
  { key: 'read_file', label: 'read_file', desc: 'Read the contents of a file', defaultOn: true },
  { key: 'list_files', label: 'list_files', desc: 'List files and directories', defaultOn: true },
  { key: 'write_file', label: 'write_file', desc: 'Write a new file to disk', defaultOn: false },
  { key: 'edit_file', label: 'edit_file', desc: 'Edit an existing file in place', defaultOn: false },
  { key: 'bash', label: 'bash', desc: 'Run shell commands (opt in carefully)', defaultOn: false },
];

const MODELS = ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'] as const;

// ---------------------------------------------------------------------------
// Cost formatting — matches PersonalUsageTile convention
// ---------------------------------------------------------------------------

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Result footer
// ---------------------------------------------------------------------------

function ResultFooter({ result }: { result: AgenticResult }) {
  const lastText = (() => {
    const src: TranscriptEntry[] = result.ok
      ? result.transcript
      : result.transcript_so_far;
    const texts = src.filter((e) => e.kind === 'assistant_text');
    const last = texts[texts.length - 1];
    return last && last.kind === 'assistant_text' ? last.text : null;
  })();

  const cost = result.ok ? result.total_cost_usd : null;
  const iterations = result.ok ? result.iterations : null;
  const stopped = result.ok ? result.stopped_reason : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Final summary callout */}
      <div
        role="region"
        aria-label={result.ok ? 'Run result' : 'Run error'}
        style={{
          padding: '14px 16px',
          border: `1px solid ${result.ok ? 'var(--rule)' : 'var(--accent)'}`,
          borderRadius: 6,
          background: result.ok ? 'var(--bg-2)' : 'var(--accent-soft)',
        }}
      >
        {!result.ok && (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontFamily: 'var(--body)',
              color: 'var(--accent)',
              fontWeight: 600,
            }}
          >
            Error: {result.error}
          </p>
        )}
        {result.ok && lastText && (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontFamily: 'var(--body)',
              color: 'var(--ink-1)',
              lineHeight: 1.6,
            }}
          >
            {lastText}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          fontSize: 13,
          fontFamily: 'var(--body)',
          color: 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {cost !== null && <span>Cost: <strong style={{ color: 'var(--ink-2)' }}>{formatCost(cost)}</strong></span>}
        {iterations !== null && <span>Iterations: <strong style={{ color: 'var(--ink-2)' }}>{iterations}</strong></span>}
        {stopped && (
          <span>
            Stopped: <strong style={{ color: 'var(--ink-2)' }}>
              {stopped === 'end_turn' ? 'completed' : 'max iterations reached'}
            </strong>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DelegateConsole() {
  // Auth mode: persisted in localStorage, defaults to 'subscription'
  const [authMode, setAuthMode] = useState<DelegateAuthMode>(readStoredMode);

  const apikeyMutation = useDelegateAgentic();
  const sdkMutation = useDelegateAgenticSdk();
  const { data: authStatus } = useAuthStatus();
  const { data: personalKeySetting } = useSetting('personal_anthropic_api_key');

  const sessionUsage = useUsage('session');
  const todayUsage = useUsage('today');

  // Derive per-mode readiness
  const subscriptionAuthenticated = authStatus?.subscription_authenticated;
  const subscriptionBlocked = authMode === 'subscription' && subscriptionAuthenticated === false;

  const mutation = authMode === 'subscription' ? sdkMutation : apikeyMutation;

  const [task, setTask] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [tools, setTools] = useState<Set<DelegateTool>>(
    new Set(TOOL_DEFS.filter((t) => t.defaultOn).map((t) => t.key)),
  );
  const [model, setModel] = useState<string>('claude-sonnet-4-6');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [maxIterations, setMaxIterations] = useState(25);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [systemPrompt, setSystemPrompt] = useState('');

  const isPending = mutation.isPending;
  const result = mutation.data ?? null;
  const transcript: TranscriptEntry[] = result
    ? result.ok
      ? result.transcript
      : result.transcript_so_far
    : [];

  const toggleTool = (key: DelegateTool) => {
    setTools((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  function handleModeChange(mode: DelegateAuthMode) {
    setAuthMode(mode);
    writeStoredMode(mode);
  }

  const handleRun = () => {
    if (!task.trim() || isPending || subscriptionBlocked) return;
    mutation.mutate({
      task: task.trim(),
      working_dir: workingDir.trim() || undefined,
      tools: [...tools],
      model,
      max_iterations: maxIterations,
      max_tokens: maxTokens,
      system: systemPrompt.trim() || undefined,
    });
  };

  const sessionCost = sessionUsage.data?.cost_usd ?? 0;
  const todayCost = todayUsage.data?.cost_usd ?? 0;

  return (
    <div
      aria-busy={isPending}
      style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
    >
      {/* ---------------------------------------------------------------- */}
      {/* Form                                                              */}
      {/* ---------------------------------------------------------------- */}
      <div
        style={{
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* ── Authentication mode toggle ── */}
        <fieldset
          style={{ border: 'none', margin: 0, padding: 0 }}
          role="radiogroup"
          aria-label="Authentication mode"
        >
          <legend
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              marginBottom: 8,
              padding: 0,
            }}
          >
            Authentication
          </legend>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(
              [
                {
                  value: 'subscription' as DelegateAuthMode,
                  label: 'Subscription',
                  caption: 'Claude.ai subscription (recommended) — counts against subscription quota.',
                },
                {
                  value: 'api-key' as DelegateAuthMode,
                  label: 'API key',
                  caption: `Personal API key from Settings — pay-per-token.${!personalKeySetting?.value ? ' (not configured)' : ''}`,
                },
              ] as const
            ).map(({ value, label, caption }) => {
              const isSelected = authMode === value;
              return (
                <label
                  key={value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 14px',
                    border: `1px solid ${isSelected ? 'var(--ink-3)' : 'var(--rule)'}`,
                    borderRadius: 6,
                    background: isSelected ? 'var(--accent-soft)' : 'transparent',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    flex: '1 1 200px',
                    transition: 'background 150ms var(--ease), border-color 150ms var(--ease)',
                  }}
                >
                  <input
                    type="radio"
                    name="delegate-auth-mode"
                    value={value}
                    checked={isSelected}
                    disabled={isPending}
                    onChange={() => handleModeChange(value)}
                    style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0 }}
                    aria-label={label}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--body)', color: 'var(--ink-1)' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--body)', color: 'var(--ink-3)', lineHeight: 1.4 }}>
                      {caption}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {/* Subscription not authenticated warning */}
          {subscriptionBlocked && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                marginTop: 10,
                padding: '10px 14px',
                border: '1px solid var(--rule)',
                borderRadius: 6,
                background: 'var(--bg-2)',
                fontSize: 13,
                fontFamily: 'var(--body)',
                color: 'var(--ink-2)',
                lineHeight: 1.5,
              }}
            >
              Claude.ai subscription not authenticated on this machine. Run{' '}
              <code style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-1)', background: 'var(--bg)', border: '1px solid var(--rule)', borderRadius: 4, padding: '1px 5px' }}>
                claude /login
              </code>{' '}
              from a terminal to authorize MasterControl, then refresh.
            </div>
          )}
        </fieldset>

        {/* Task */}
        <div>
          <label
            htmlFor="delegate-task"
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              marginBottom: 6,
            }}
          >
            Task
          </label>
          <textarea
            id="delegate-task"
            rows={6}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe what the agent should do…"
            disabled={isPending}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '10px 12px',
              fontSize: 14,
              fontFamily: 'var(--body)',
              color: 'var(--ink-1)',
              background: 'var(--bg)',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Working directory */}
        <div>
          <label
            htmlFor="delegate-workdir"
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              marginBottom: 6,
            }}
          >
            Working directory
          </label>
          <input
            id="delegate-workdir"
            type="text"
            value={workingDir}
            onChange={(e) => setWorkingDir(e.target.value)}
            placeholder="Leave blank for the default sandbox at ~/mastercontrol-delegate-workspace"
            disabled={isPending}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 13,
              fontFamily: 'var(--mono)',
              color: 'var(--ink-1)',
              background: 'var(--bg)',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Tools */}
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              marginBottom: 8,
              padding: 0,
            }}
          >
            Tools
          </legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TOOL_DEFS.map(({ key, label, desc }) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={tools.has(key)}
                  onChange={() => toggleTool(key)}
                  disabled={isPending}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: 'var(--mono)',
                    color: 'var(--ink-1)',
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--body)',
                    color: 'var(--ink-3)',
                  }}
                >
                  — {desc}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Model */}
        <div>
          <label
            htmlFor="delegate-model"
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              marginBottom: 6,
            }}
          >
            Model
          </label>
          <select
            id="delegate-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isPending}
            style={{
              padding: '7px 10px',
              fontSize: 13,
              fontFamily: 'var(--body)',
              color: 'var(--ink-1)',
              background: 'var(--bg)',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Advanced disclosure */}
        <div>
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 0',
              fontSize: 13,
              fontFamily: 'var(--body)',
              color: 'var(--ink-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span>
            Advanced
          </button>

          {advancedOpen && (
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                paddingLeft: 16,
                borderLeft: '2px solid var(--rule)',
              }}
            >
              {/* max_iterations */}
              <div>
                <label
                  htmlFor="delegate-max-iter"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: 'var(--ink-3)',
                    fontFamily: 'var(--body)',
                    marginBottom: 6,
                  }}
                >
                  Max iterations (5–50)
                </label>
                <input
                  id="delegate-max-iter"
                  type="number"
                  min={5}
                  max={50}
                  value={maxIterations}
                  onChange={(e) =>
                    setMaxIterations(Math.max(5, Math.min(50, Number(e.target.value))))
                  }
                  disabled={isPending}
                  style={{
                    width: 80,
                    padding: '7px 10px',
                    fontSize: 13,
                    fontFamily: 'var(--mono)',
                    color: 'var(--ink-1)',
                    background: 'var(--bg)',
                    border: '1px solid var(--rule)',
                    borderRadius: 6,
                  }}
                />
              </div>

              {/* max_tokens */}
              <div>
                <label
                  htmlFor="delegate-max-tokens"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: 'var(--ink-3)',
                    fontFamily: 'var(--body)',
                    marginBottom: 6,
                  }}
                >
                  Max tokens (256–8192)
                </label>
                <input
                  id="delegate-max-tokens"
                  type="number"
                  min={256}
                  max={8192}
                  value={maxTokens}
                  onChange={(e) =>
                    setMaxTokens(Math.max(256, Math.min(8192, Number(e.target.value))))
                  }
                  disabled={isPending}
                  style={{
                    width: 100,
                    padding: '7px 10px',
                    fontSize: 13,
                    fontFamily: 'var(--mono)',
                    color: 'var(--ink-1)',
                    background: 'var(--bg)',
                    border: '1px solid var(--rule)',
                    borderRadius: 6,
                  }}
                />
              </div>

              {/* system prompt */}
              <div>
                <label
                  htmlFor="delegate-system"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: 'var(--ink-3)',
                    fontFamily: 'var(--body)',
                    marginBottom: 6,
                  }}
                >
                  System prompt override
                </label>
                <textarea
                  id="delegate-system"
                  rows={4}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Optional — overrides the default system prompt."
                  disabled={isPending}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    padding: '10px 12px',
                    fontSize: 13,
                    fontFamily: 'var(--body)',
                    color: 'var(--ink-1)',
                    background: 'var(--bg)',
                    border: '1px solid var(--rule)',
                    borderRadius: 6,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Run row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <button
            type="button"
            onClick={handleRun}
            disabled={!task.trim() || isPending || subscriptionBlocked}
            aria-label={isPending ? 'Running…' : 'Run agent task'}
            style={{
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'var(--body)',
              color: '#fff',
              background: !task.trim() || isPending || subscriptionBlocked ? 'var(--ink-3)' : 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              cursor: !task.trim() || isPending || subscriptionBlocked ? 'not-allowed' : 'pointer',
              transition: 'background 200ms var(--ease), opacity 200ms var(--ease)',
            }}
          >
            {isPending ? 'Running…' : 'Run Agent'}
          </button>

          {/* Live cost meter */}
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontFamily: 'var(--body)',
              color: 'var(--ink-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Session:{' '}
            <span style={{ color: 'var(--ink-2)' }}>{formatCost(sessionCost)}</span>
            {' '}&nbsp;Today:{' '}
            <span style={{ color: 'var(--ink-2)' }}>{formatCost(todayCost)}</span>
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Transcript / Empty state                                         */}
      {/* ---------------------------------------------------------------- */}
      {result === null && !isPending && (
        <div
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 8,
            padding: '40px 24px',
            textAlign: 'center',
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <p style={{ margin: '0 0 6px' }}>
            Type a task above. The agent will use the tools you allow to complete it.
          </p>
          <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>
            You&rsquo;ll see each step here when the run finishes.
          </p>
        </div>
      )}

      {isPending && (
        <div
          role="status"
          aria-label="Agent running"
          style={{
            padding: '32px 24px',
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
            fontSize: 14,
          }}
        >
          Agent running… this may take a moment.
        </div>
      )}

      {result !== null && !isPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ResultFooter result={result} />
          {transcript.length > 0 && (
            <DelegateConsoleTranscript entries={transcript} />
          )}
        </div>
      )}
    </div>
  );
}
