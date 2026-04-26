/**
 * subagentSdk.service.ts — delegate agentic tasks to Claude via the
 * @anthropic-ai/claude-agent-sdk, which uses OAuth credentials stored
 * by `claude /login` in ~/.claude/.credentials.json rather than a
 * metered API key.
 *
 * Usage counts against the user's Claude.ai subscription (Pro/Max/Team)
 * — no per-token cost. We still record token counts in
 * `anthropic_usage_events` with cost_usd_micros=0 for visibility.
 *
 * This is purely additive. The existing `delegate()` / `delegateAgentic()`
 * paths in subagent.service.ts are untouched.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.js';
import { anthropicUsageModel } from '../models/anthropicUsage.model.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { AgenticDelegateRequest } from '../schemas/subagent.schema.js';
import type { AgenticResult, AgenticStreamOptions, TranscriptEntry } from './subagent.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TURNS = 25;
const HARD_MAX_TURNS = 50;
const DEFAULT_WORKSPACE_DIR = path.join(os.homedir(), 'mastercontrol-delegate-workspace');

/**
 * Map our request schema's snake_case tool names → the Agent SDK's built-in
 * tool names (CamelCase). The frontend Console uses our names so the
 * subscription path and the API-key path can share a single tool selector;
 * we translate at the SDK boundary here. Unknown names pass through
 * unchanged so a user can also pass an SDK-native tool name directly
 * (e.g. 'Glob') if they want.
 */
const TOOL_NAME_MAP: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  list_files: 'Glob',
  bash: 'Bash',
};

function toSdkToolNames(names: readonly string[]): string[] {
  return names.map((n) => TOOL_NAME_MAP[n] ?? n);
}

// ---------------------------------------------------------------------------
// Auth-error detection helpers
// ---------------------------------------------------------------------------

/**
 * Strings the Agent SDK subprocess may surface when OAuth credentials are
 * absent or expired. We match substrings case-insensitively.
 */
const AUTH_ERROR_SUBSTRINGS = [
  'no credentials',
  'not authenticated',
  'authentication_failed',
  'credentials.json',
  'claude /login',
  'oauth',
  'unauthorized',
  'invalid_api_key',
  'api key',
];

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_SUBSTRINGS.some((s) => lower.includes(s));
}

const AUTH_ACTION_MESSAGE =
  'Claude.ai subscription not authenticated. Run `claude /login` first to authorize MasterControl to use your subscription.';

// ---------------------------------------------------------------------------
// Working-dir resolution (mirrors subagent.service.ts)
// ---------------------------------------------------------------------------

function resolveWorkingDir(requested: string | undefined): string {
  if (!requested || requested.trim().length === 0) {
    fs.mkdirSync(DEFAULT_WORKSPACE_DIR, { recursive: true });
    return DEFAULT_WORKSPACE_DIR;
  }
  const resolved = path.resolve(requested);
  if (!fs.existsSync(resolved)) {
    throw new HttpError(400, `working_dir does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new HttpError(400, `working_dir is not a directory: ${resolved}`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Locate the `claude` executable so we can hand the SDK an explicit path
// instead of relying on PATH inheritance, which is unreliable on Windows
// (Claude Desktop's MSIX-bundled CLI lives under
// `%LocalAppData%\Packages\Claude_*\LocalCache\Roaming\Claude\claude-code\<ver>\claude.exe`
// — that directory is not in the PATH that node-spawned subprocesses see).
//
// Lookup order:
//   1. CLAUDE_CODE_EXECUTABLE_PATH env var (manual override / escape hatch)
//   2. npm global install: %APPDATA%\npm\claude.cmd  /  ~/.npm-global/bin/claude
//   3. MSIX-bundled: %LocalAppData%\Packages\Claude_*\LocalCache\Roaming\Claude\
//                    claude-code\<latest-version>\claude.exe
//   4. Return undefined → SDK falls back to its built-in spawn (and PATH).
//
// Result is cached for the process lifetime; restart the backend to pick up
// a new install.
// ---------------------------------------------------------------------------

let _resolvedExecutable: string | null | undefined = undefined;

export function resolveClaudeExecutable(): string | null {
  if (_resolvedExecutable !== undefined) return _resolvedExecutable;
  _resolvedExecutable = doResolveClaudeExecutable();
  return _resolvedExecutable;
}

function doResolveClaudeExecutable(): string | null {
  // 1. Explicit env override.
  const envOverride = process.env.CLAUDE_CODE_EXECUTABLE_PATH;
  if (envOverride && fs.existsSync(envOverride)) return envOverride;

  // 2. npm global bin.
  const appdata = process.env.APPDATA;
  if (appdata) {
    const npmCmd = path.join(appdata, 'npm', 'claude.cmd');
    if (fs.existsSync(npmCmd)) return npmCmd;
    const npmBare = path.join(appdata, 'npm', 'claude');
    if (fs.existsSync(npmBare)) return npmBare;
  }

  // 3. MSIX-bundled (Claude Desktop on Windows).
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const packagesRoot = path.join(localAppData, 'Packages');
    if (fs.existsSync(packagesRoot)) {
      try {
        const claudePackages = fs
          .readdirSync(packagesRoot)
          .filter((name) => name.toLowerCase().startsWith('claude_'));
        for (const pkg of claudePackages) {
          const codeRoot = path.join(
            packagesRoot,
            pkg,
            'LocalCache',
            'Roaming',
            'Claude',
            'claude-code',
          );
          if (!fs.existsSync(codeRoot)) continue;
          // Sort version dirs descending so we pick the newest.
          const versions = fs
            .readdirSync(codeRoot)
            .filter((v) => /^\d+\.\d+\.\d+/.test(v))
            .sort((a, b) => compareSemver(b, a));
          for (const version of versions) {
            const exe = path.join(codeRoot, version, 'claude.exe');
            if (fs.existsSync(exe)) return exe;
          }
        }
      } catch {
        // Permission error or transient — fall through to next tier.
      }
    }
  }

  // 4. Give up; let the SDK try.
  return null;
}

function compareSemver(a: string, b: string): number {
  const av = a.split('.').map((n) => parseInt(n, 10));
  const bv = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Locate bash.exe on Windows. Claude Code refuses to run without Git Bash
// available; if it can't find it on PATH it instructs the user to set
// CLAUDE_CODE_GIT_BASH_PATH. We auto-detect the common install locations
// here and set the env var before spawning so the SDK subprocess inherits
// it. No-op on non-Windows (bash is always on PATH).
// ---------------------------------------------------------------------------

let _bashPathResolved = false;

function ensureBashEnvForClaudeCode(): void {
  if (_bashPathResolved) return;
  _bashPathResolved = true;

  if (process.platform !== 'win32') return;
  if (process.env.CLAUDE_CODE_GIT_BASH_PATH) return; // user already set it

  const candidates: string[] = [];
  const local = process.env.LOCALAPPDATA;
  if (local) {
    candidates.push(path.join(local, 'Programs', 'Git', 'usr', 'bin', 'bash.exe'));
    candidates.push(path.join(local, 'Programs', 'Git', 'bin', 'bash.exe'));
  }
  candidates.push('C:\\Program Files\\Git\\usr\\bin\\bash.exe');
  candidates.push('C:\\Program Files\\Git\\bin\\bash.exe');
  candidates.push('C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe');

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      process.env.CLAUDE_CODE_GIT_BASH_PATH = c;
      return;
    }
  }
  // Couldn't find it — leave env unset, the SDK will surface the missing-
  // bash error to the user with its own instructions.
}

// ---------------------------------------------------------------------------
// SDK event narrowing helpers
// ---------------------------------------------------------------------------

function isAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === 'assistant';
}

function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === 'result';
}

// ---------------------------------------------------------------------------
// Accumulated usage
// ---------------------------------------------------------------------------

interface AccumulatedUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

function emptyUsage(): AccumulatedUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run an agentic task via the Agent SDK (Claude.ai subscription, OAuth auth).
 *
 * Returns the same `AgenticResult` shape as `delegateAgentic()` so the
 * frontend and any callers can treat both paths uniformly.
 *
 * HTTP-level errors (bad working_dir) throw `HttpError` — let those
 * propagate to the route. Runtime SDK errors are caught and returned as
 * `{ ok: false, error }` with status 200.
 */
export async function delegateViaSubscription(
  input: AgenticDelegateRequest,
  options?: AgenticStreamOptions,
): Promise<AgenticResult> {
  const maxTurns = Math.min(
    input.max_iterations ?? DEFAULT_MAX_TURNS,
    HARD_MAX_TURNS,
  );

  // Validate working dir (throws HttpError on bad config — propagates to route).
  const workingDir = resolveWorkingDir(input.working_dir);

  // Pre-flight credential check. The Agent SDK spawns the `claude` subprocess
  // which exits with a generic non-zero code if no OAuth credentials exist —
  // checking here lets us return a clean, actionable message instead of
  // surfacing "Claude Code process exited with code 1".
  const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
  if (!fs.existsSync(credsPath)) {
    anthropicUsageModel.record({
      source: 'delegate',
      model: 'claude-sonnet-4-6',
      input_tokens: 0,
      output_tokens: 0,
      cost_usd_micros: 0,
      task_summary: input.task_summary ?? null,
      error: AUTH_ACTION_MESSAGE,
    });
    return {
      ok: false,
      error: AUTH_ACTION_MESSAGE,
      transcript_so_far: [],
      total_usage: emptyUsage(),
    };
  }

  // Transcript accumulated across all SDK events.
  const transcript: TranscriptEntry[] = [];
  const totalUsage = emptyUsage();

  /** Push an entry into the transcript and fire the optional streaming callback. */
  const pushEntry = (entry: TranscriptEntry): void => {
    transcript.push(entry);
    options?.onEvent?.(entry);
  };

  // Track which turn we are on (each SDKAssistantMessage is one turn).
  let turn = 0;

  // We record one consolidated usage row at the end of the run.
  let finalModel = 'claude-sonnet-4-6';
  let stoppedReason: 'end_turn' | 'max_iterations' = 'end_turn';
  let totalCostUsd = 0;

  // Resolve the Claude Code executable path. On Windows the binary often
  // lives in a path that node-spawned subprocesses don't inherit (Claude
  // Desktop's MSIX bundle in particular). Pass it explicitly so the SDK's
  // spawn doesn't fail with a generic exit code 1.
  const claudeExe = resolveClaudeExecutable();

  // Claude Code on Windows needs Git Bash. Autodetect and set the env var
  // it looks for so the SDK subprocess can find bash.exe.
  ensureBashEnvForClaudeCode();

  try {
    const sdkQuery = query({
      prompt: input.task,
      options: {
        cwd: workingDir,
        // allowedTools auto-approves the SDK's built-in tools without
        // prompting. Translate our snake_case names → SDK CamelCase names
        // (read_file → Read, bash → Bash, etc.) so the same Console form
        // works for both auth modes.
        allowedTools: toSdkToolNames(input.tools),
        // permissionMode: 'acceptEdits' so file writes don't block on a prompt.
        permissionMode: 'acceptEdits',
        maxTurns,
        ...(claudeExe ? { pathToClaudeCodeExecutable: claudeExe } : {}),
        // Don't persist these automated sessions to ~/.claude/projects/.
        persistSession: false,
      },
    });

    for await (const event of sdkQuery) {
      if (isAssistantMessage(event)) {
        turn += 1;
        const currentTurn = turn;

        // Accumulate per-turn usage from the BetaMessage.
        const msgUsage = event.message.usage;
        totalUsage.input_tokens += msgUsage.input_tokens;
        totalUsage.output_tokens += msgUsage.output_tokens;
        totalUsage.cache_read_input_tokens += msgUsage.cache_read_input_tokens ?? 0;
        totalUsage.cache_creation_input_tokens += msgUsage.cache_creation_input_tokens ?? 0;

        // Capture the model reported in this turn.
        finalModel = event.message.model;

        // Walk content blocks and emit transcript entries.
        for (const block of event.message.content as BetaContentBlock[]) {
          if (block.type === 'text') {
            // Include `turn` as an extra field (not in the base TranscriptEntry
            // type but accepted at runtime for SDK parity with the spec doc).
            const entry: TranscriptEntry = { kind: 'assistant_text', text: block.text };
            // Spread turn as a runtime decoration — callers may use it.
            (entry as TranscriptEntry & { turn: number }).turn = currentTurn;
            pushEntry(entry);
          } else if (block.type === 'tool_use') {
            const entry: TranscriptEntry = {
              kind: 'assistant_tool_use',
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            };
            (entry as TranscriptEntry & { turn: number }).turn = currentTurn;
            pushEntry(entry);
          }
          // thinking / redacted_thinking blocks are silently skipped.
        }

        // If the assistant message carries an auth error flag, surface it now.
        if (event.error === 'authentication_failed') {
          // Record a zero-cost failure row then return.
          anthropicUsageModel.record({
            source: 'delegate',
            model: finalModel,
            input_tokens: 0,
            output_tokens: 0,
            cost_usd_micros: 0,
            task_summary: input.task_summary ?? null,
            error: AUTH_ACTION_MESSAGE,
          });
          return {
            ok: false,
            error: AUTH_ACTION_MESSAGE,
            transcript_so_far: transcript,
            total_usage: totalUsage,
          };
        }
      } else if (isResultMessage(event)) {
        // The result message carries the authoritative aggregate usage.
        const ru = event.usage;
        totalUsage.input_tokens = ru.input_tokens;
        totalUsage.output_tokens = ru.output_tokens;
        totalUsage.cache_read_input_tokens = ru.cache_read_input_tokens ?? 0;
        totalUsage.cache_creation_input_tokens = ru.cache_creation_input_tokens ?? 0;
        totalCostUsd = event.total_cost_usd;

        if (event.subtype !== 'success') {
          // error subtypes: error_during_execution | error_max_turns | error_max_budget_usd
          const errMsg =
            event.subtype === 'error_max_turns'
              ? `Agentic run stopped after reaching max_iterations (${maxTurns}).`
              : `Agentic run ended with error: ${event.subtype}. ${
                  'errors' in event ? event.errors.join('; ') : ''
                }`.trim();

          if (event.subtype === 'error_max_turns') {
            stoppedReason = 'max_iterations';
          }

          anthropicUsageModel.record({
            source: 'delegate',
            model: finalModel,
            input_tokens: totalUsage.input_tokens,
            output_tokens: totalUsage.output_tokens,
            cache_read_input_tokens: totalUsage.cache_read_input_tokens,
            cache_creation_input_tokens: totalUsage.cache_creation_input_tokens,
            cost_usd_micros: 0, // subscription — no per-token cost
            request_id: null,
            task_summary: input.task_summary ?? null,
            error: errMsg,
          });

          return {
            ok: false,
            error: errMsg,
            transcript_so_far: transcript,
            total_usage: totalUsage,
          };
        }

        // Success: record usage and fall through to the return below.
        anthropicUsageModel.record({
          source: 'delegate',
          model: finalModel,
          input_tokens: totalUsage.input_tokens,
          output_tokens: totalUsage.output_tokens,
          cache_read_input_tokens: totalUsage.cache_read_input_tokens,
          cache_creation_input_tokens: totalUsage.cache_creation_input_tokens,
          cost_usd_micros: 0, // subscription — no per-token cost
          request_id: null,
          task_summary: input.task_summary ?? null,
        });

        return {
          ok: true,
          transcript,
          total_usage: totalUsage,
          total_cost_usd: totalCostUsd,
          iterations: event.num_turns,
          stopped_reason: stoppedReason,
        };
      }
      // All other event types (system/init, user, auth_status, etc.) are ignored.
    }

    // Generator exhausted without a result message (shouldn't happen, but
    // defensive fallback).
    anthropicUsageModel.record({
      source: 'delegate',
      model: finalModel,
      input_tokens: totalUsage.input_tokens,
      output_tokens: totalUsage.output_tokens,
      cost_usd_micros: 0,
      task_summary: input.task_summary ?? null,
    });

    return {
      ok: true,
      transcript,
      total_usage: totalUsage,
      total_cost_usd: totalCostUsd,
      iterations: turn,
      stopped_reason: stoppedReason,
    };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const errorMessage = isAuthError(rawMessage) ? AUTH_ACTION_MESSAGE : rawMessage;

    anthropicUsageModel.record({
      source: 'delegate',
      model: finalModel,
      input_tokens: totalUsage.input_tokens,
      output_tokens: totalUsage.output_tokens,
      cost_usd_micros: 0,
      task_summary: input.task_summary ?? null,
      error: errorMessage,
    });

    return {
      ok: false,
      error: errorMessage,
      transcript_so_far: transcript,
      total_usage: totalUsage,
    };
  }
}
