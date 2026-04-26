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
import type { AgenticResult, TranscriptEntry } from './subagent.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TURNS = 25;
const HARD_MAX_TURNS = 50;
const DEFAULT_WORKSPACE_DIR = path.join(os.homedir(), 'mastercontrol-delegate-workspace');

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
): Promise<AgenticResult> {
  const maxTurns = Math.min(
    input.max_iterations ?? DEFAULT_MAX_TURNS,
    HARD_MAX_TURNS,
  );

  // Validate working dir (throws HttpError on bad config — propagates to route).
  const workingDir = resolveWorkingDir(input.working_dir);

  // Transcript accumulated across all SDK events.
  const transcript: TranscriptEntry[] = [];
  const totalUsage = emptyUsage();

  // Track which turn we are on (each SDKAssistantMessage is one turn).
  let turn = 0;

  // We record one consolidated usage row at the end of the run.
  let finalModel = 'claude-sonnet-4-6';
  let stoppedReason: 'end_turn' | 'max_iterations' = 'end_turn';
  let totalCostUsd = 0;

  try {
    const sdkQuery = query({
      prompt: input.task,
      options: {
        cwd: workingDir,
        // allowedTools auto-approves the SDK's built-in tools without prompting.
        allowedTools: input.tools,
        // permissionMode: 'acceptEdits' so file writes don't block on a prompt.
        permissionMode: 'acceptEdits',
        maxTurns,
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
            transcript.push(entry);
          } else if (block.type === 'tool_use') {
            const entry: TranscriptEntry = {
              kind: 'assistant_tool_use',
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            };
            (entry as TranscriptEntry & { turn: number }).turn = currentTurn;
            transcript.push(entry);
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
