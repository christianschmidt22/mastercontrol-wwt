/**
 * DelegateConsole.tsx
 *
 * UI for submitting an agentic delegation task and viewing the transcript
 * as entries stream in via SSE. The JSON mutation hooks are kept for
 * backward compatibility; the Run button uses the streaming variants.
 *
 * Component budget: ~200 lines. Heavy transcript rendering is in
 * DelegateConsoleTranscript.tsx.
 */

import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDelegateAgentic,
  useDelegateAgenticSdk,
  useAuthStatus,
  useUsage,
  streamDelegateAgentic,
  streamDelegateAgenticSdk,
  subagentKeys,
} from '../../api/useSubagent';
import { useSetting } from '../../api/useSettings';
import type {
  DelegateTool,
  AgenticResult,
  TranscriptEntry,
  DelegateAuthMode,
} from '../../types/subagent';
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

  // Keep JSON mutation hooks for backward compat — not used for the Run button
  // anymore but kept so existing callers of useDelegateAgentic/Sdk still work.
  const apikeyMutation = useDelegateAgentic();
  const sdkMutation = useDelegateAgenticSdk();
  const { data: authStatus } = useAuthStatus();
  const { data: personalKeySetting } = useSetting('personal_anthropic_api_key');
  const qc = useQueryClient();

  const sessionUsage = useUsage('session');
  const todayUsage = useUsage('today');

  // Derive per-mode readiness
  const subscriptionAuthenticated = authStatus?.subscription_authenticated;
  const subscriptionBlocked = authMode === 'subscription' && subscriptionAuthenticated === false;

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamTranscript, setStreamTranscript] = useState<TranscriptEntry[]>([]);
  const [streamResult, setStreamResult] = useState<AgenticResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Counter used to invalidate usage periodically during streaming.
  const entryCountRef = useRef(0);

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
  const [maxCostUsd, setMaxCostUsd] = useState<string>('');

  // Validate the optional cost cap field.
  const maxCostUsdNum = maxCostUsd !== '' ? parseFloat(maxCostUsd) : undefined;
  const maxCostUsdError =
    maxCostUsdNum !== undefined && (isNaN(maxCostUsdNum) || maxCostUsdNum <= 0 || maxCostUsdNum > 100)
      ? 'Must be a positive number ≤ 100'
      : null;

  // Prefer streaming transcript/result; fall back to JSON mutation data.
  const isPending = isStreaming || apikeyMutation.isPending || sdkMutation.isPending;

  // Build the displayed result from streaming state if available.
  const result: AgenticResult | null = streamResult ?? apikeyMutation.data ?? sdkMutation.data ?? null;

  const transcript: TranscriptEntry[] = isStreaming
    ? streamTranscript
    : result
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

  const handleRun = useCallback(() => {
    if (!task.trim() || isPending || subscriptionBlocked) return;

    const validMaxCostUsd =
      maxCostUsdNum !== undefined && !maxCostUsdError ? maxCostUsdNum : undefined;

    const input = {
      task: task.trim(),
      working_dir: workingDir.trim() || undefined,
      tools: [...tools],
      model,
      max_iterations: maxIterations,
      max_tokens: maxTokens,
      system: systemPrompt.trim() || undefined,
      max_cost_usd: validMaxCostUsd,
    };

    // Reset streaming state for the new run.
    setStreamTranscript([]);
    setStreamResult(null);
    setIsStreaming(true);
    entryCountRef.current = 0;

    const abort = new AbortController();
    abortRef.current = abort;

    const streamFn = authMode === 'subscription' ? streamDelegateAgenticSdk : streamDelegateAgentic;

    // Local accumulator so onDone and onError closures see the full transcript
    // without depending on potentially-stale React state snapshots.
    const accumulated: TranscriptEntry[] = [];

    streamFn(input, {
      onEntry: (entry) => {
        accumulated.push(entry);
        setStreamTranscript((prev) => [...prev, entry]);
        entryCountRef.current += 1;
        // Invalidate usage tile every 5 entries so the cost meter updates live.
        if (entryCountRef.current % 5 === 0) {
          void qc.invalidateQueries({ queryKey: subagentKeys.usage('session') });
          void qc.invalidateQueries({ queryKey: subagentKeys.usage('today') });
        }
      },
      onDone: (evt) => {
        const doneResult: AgenticResult = {
          ok: true,
          transcript: [...accumulated],
          total_usage: evt.total_usage,
          total_cost_usd: evt.total_cost_usd,
          iterations: evt.iterations,
          stopped_reason: evt.stopped_reason,
        };
        setStreamResult(doneResult);
        setIsStreaming(false);
        void qc.invalidateQueries({ queryKey: ['subagent', 'usage'] });
      },
      onError: (evt) => {
        const errResult: AgenticResult = {
          ok: false,
          error: evt.error,
          transcript_so_far: evt.transcript_so_far,
          total_usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        };
        setStreamResult(errResult);
        setIsStreaming(false);
        void qc.invalidateQueries({ queryKey: ['subagent', 'usage'] });
      },
      signal: abort.signal,
    }).catch((err: unknown) => {
      // AbortError from navigation = clean cancel; don't show error.
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (!isAbort) {
        setStreamResult({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          transcript_so_far: [...accumulated],
          total_usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        });
      }
      setIsStreaming(false);
    });
  }, [task, isPending, subscriptionBlocked, workingDir, tools, model, maxIterations, maxTokens, systemPrompt, maxCostUsdNum, maxCostUsdError, authMode, qc]);

  // Cancel in-flight stream when the component unmounts.
  const handleAbort = () => {
    abortRef.current?.abort();
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

              {/* max_cost_usd */}
              <div>
                <label
                  htmlFor="delegate-max-cost"
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
                  Max cost ($USD)
                </label>
                <input
                  id="delegate-max-cost"
                  type="number"
                  min={0.000001}
                  max={100}
                  step={0.01}
                  value={maxCostUsd}
                  onChange={(e) => setMaxCostUsd(e.target.value)}
                  placeholder="No cap"
                  disabled={isPending}
                  aria-describedby={maxCostUsdError ? 'delegate-max-cost-error' : undefined}
                  style={{
                    width: 110,
                    padding: '7px 10px',
                    fontSize: 13,
                    fontFamily: 'var(--mono)',
                    color: 'var(--ink-1)',
                    background: 'var(--bg)',
                    border: `1px solid ${maxCostUsdError ? 'var(--accent)' : 'var(--rule)'}`,
                    borderRadius: 6,
                  }}
                />
                {maxCostUsdError && (
                  <p
                    id="delegate-max-cost-error"
                    role="alert"
                    style={{
                      margin: '4px 0 0',
                      fontSize: 12,
                      fontFamily: 'var(--body)',
                      color: 'var(--accent)',
                    }}
                  >
                    {maxCostUsdError}
                  </p>
                )}
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
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={handleRun}
              disabled={!task.trim() || isPending || subscriptionBlocked || maxCostUsdError !== null}
              aria-label={isPending ? 'Running…' : 'Run agent task'}
              style={{
                padding: '10px 24px',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'var(--body)',
                color: '#fff',
                background: !task.trim() || isPending || subscriptionBlocked || maxCostUsdError !== null ? 'var(--ink-3)' : 'var(--accent)',
                border: 'none',
                borderRadius: 6,
                cursor: !task.trim() || isPending || subscriptionBlocked || maxCostUsdError !== null ? 'not-allowed' : 'pointer',
                transition: 'background 200ms var(--ease), opacity 200ms var(--ease)',
              }}
            >
              {isPending ? 'Running…' : 'Run Agent'}
            </button>

            {/* Streaming indicator + abort button */}
            {isStreaming && (
              <>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--body)',
                    color: 'var(--ink-3)',
                    letterSpacing: '0.04em',
                  }}
                >
                  Streaming
                </span>
                <button
                  type="button"
                  onClick={handleAbort}
                  aria-label="Cancel streaming run"
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    fontFamily: 'var(--body)',
                    color: 'var(--ink-2)',
                    background: 'none',
                    border: '1px solid var(--rule)',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>

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

      {/* Streaming: show partial transcript as it arrives, with running status */}
      {isStreaming && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            role="status"
            aria-label="Agent running"
            style={{
              padding: '12px 16px',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              background: 'var(--bg-2)',
              fontSize: 13,
              fontFamily: 'var(--body)',
              color: 'var(--ink-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span aria-hidden="true">●</span>
            Agent running… {streamTranscript.length} event{streamTranscript.length !== 1 ? 's' : ''} received
          </div>
          {streamTranscript.length > 0 && (
            <div aria-live="polite" aria-label="Agent transcript">
              <DelegateConsoleTranscript entries={streamTranscript} />
            </div>
          )}
        </div>
      )}

      {!isStreaming && isPending && (
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
            <div aria-live="polite" aria-label="Agent transcript">
              <DelegateConsoleTranscript entries={transcript} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
