/**
 * subagent.service.ts — delegate one-shot and agentic tasks to the user's
 * PERSONAL Anthropic subscription (separate from the org-chat key). Records
 * every call in `anthropic_usage_events`.
 *
 * "Personal" vs "org chat" key:
 *   - `anthropic_api_key`           — used by claude.service.ts for per-org
 *                                     chat (`/api/agents/:org_id/chat`).
 *   - `personal_anthropic_api_key`  — used HERE for delegated subagent tasks.
 *   Both go through DPAPI via settings.model's SECRET_KEYS allowlist.
 *
 * The session boundary is the process start time — same as a single dev/run
 * of the backend. After a restart, the "session" usage tile resets to zero.
 */
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { settingsModel } from '../models/settings.model.js';
import { anthropicUsageModel } from '../models/anthropicUsage.model.js';
import { computeCostMicros } from '../lib/anthropicPricing.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { DelegateRequest, AgenticDelegateRequest } from '../schemas/subagent.schema.js';
import {
  SUBAGENT_TOOLS,
  ALLOWED_TOOL_NAMES,
  buildToolDefinitions,
  type AllowedToolName,
  type AuditEntry,
} from './subagentTools.service.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;
const HARD_MAX_TOKENS = 8192;

const SESSION_START_ISO = new Date().toISOString();

export interface DelegateSuccess {
  ok: true;
  content: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
  request_id: string | null;
  cost_usd: number;
}

export interface DelegateFailure {
  ok: false;
  error: string;
}

export type DelegateResult = DelegateSuccess | DelegateFailure;

/** Get the ISO timestamp of when this backend process started. */
export function getSessionStart(): string {
  return SESSION_START_ISO;
}

function getPersonalClient(): Anthropic {
  const apiKey = settingsModel.get('personal_anthropic_api_key');
  if (!apiKey) {
    throw new HttpError(
      400,
      'Personal Anthropic API key not configured. Add it in Settings → Personal Claude Subscription.',
    );
  }
  return new Anthropic({ apiKey });
}

/**
 * Extract the assistant's text from a non-streaming response. Concatenates
 * all `text` content blocks; ignores tool_use / image / etc. blocks.
 */
function extractText(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function normalizeUsage(usage: UsageBlock | undefined) {
  return {
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Agentic types
// ---------------------------------------------------------------------------

/** One entry in the transcript returned to the caller. */
export type TranscriptEntry =
  | { kind: 'assistant_text'; text: string }
  | { kind: 'assistant_tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { kind: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }
  | { kind: 'audit'; entry: AuditEntry };

export interface AgenticSuccess {
  ok: true;
  transcript: TranscriptEntry[];
  total_usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
  total_cost_usd: number;
  iterations: number;
  stopped_reason: 'end_turn' | 'max_iterations';
}

export interface AgenticFailure {
  ok: false;
  error: string;
  transcript_so_far: TranscriptEntry[];
  total_usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}

export type AgenticResult = AgenticSuccess | AgenticFailure;

// ---------------------------------------------------------------------------
// Agentic constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ITERATIONS = 25;
const HARD_MAX_ITERATIONS = 50;

// ---------------------------------------------------------------------------
// Helpers: accumulated usage
// ---------------------------------------------------------------------------

interface AccumulatedUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

function emptyUsage(): AccumulatedUsage {
  return { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
}

function addUsage(acc: AccumulatedUsage, delta: UsageBlock | undefined): void {
  acc.input_tokens += delta?.input_tokens ?? 0;
  acc.output_tokens += delta?.output_tokens ?? 0;
  acc.cache_read_input_tokens += delta?.cache_read_input_tokens ?? 0;
  acc.cache_creation_input_tokens += delta?.cache_creation_input_tokens ?? 0;
}

// ---------------------------------------------------------------------------
// Agentic working_dir resolution
// ---------------------------------------------------------------------------

const DEFAULT_WORKSPACE_DIR = path.join(os.homedir(), 'mastercontrol-delegate-workspace');

/**
 * Resolve and validate the working_dir for an agentic run.
 *  - If undefined, defaults to ~/mastercontrol-delegate-workspace (created if needed).
 *  - If provided, must be an existing directory.
 */
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
// Validate requested tools
// ---------------------------------------------------------------------------

function validateRequestedTools(tools: string[]): AllowedToolName[] {
  const invalid = tools.filter((t) => !(ALLOWED_TOOL_NAMES as ReadonlyArray<string>).includes(t));
  if (invalid.length > 0) {
    throw new HttpError(400, `Unknown tools requested: ${invalid.join(', ')}`);
  }
  return tools as AllowedToolName[];
}

// ---------------------------------------------------------------------------
// One-shot delegate (existing)
// ---------------------------------------------------------------------------

/**
 * Run a one-shot delegation against the personal subscription.
 *
 * Failures are recorded to the usage table (with cost_usd_micros=0 + error)
 * and returned as `{ ok: false, error }`. The route handler returns 200 with
 * that body — the HTTP call itself succeeded, the underlying API call did
 * not. Configuration errors (missing key) DO throw HttpError so the route
 * returns 400 + an actionable message.
 */
export async function delegate(input: DelegateRequest): Promise<DelegateResult> {
  const model = input.model && input.model.length > 0 ? input.model : DEFAULT_MODEL;
  const maxTokens = Math.min(input.max_tokens ?? DEFAULT_MAX_TOKENS, HARD_MAX_TOKENS);

  let client: Anthropic;
  try {
    client = getPersonalClient();
  } catch (err) {
    // Re-throw config errors — route maps to 400.
    throw err;
  }

  try {
    const messageParams: Anthropic.Messages.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: input.task }],
    };
    if (input.system) messageParams.system = input.system;
    if (input.tools && input.tools.length > 0) {
      // Pass tools through opaquely — the user/caller is responsible for the shape.
      messageParams.tools = input.tools as Anthropic.Messages.MessageCreateParams['tools'];
    }

    const response = await client.messages.create(messageParams) as Anthropic.Messages.Message;
    const usage = normalizeUsage(response.usage);
    const content = extractText(response);
    const costMicros = computeCostMicros(
      model,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_read_input_tokens,
      usage.cache_creation_input_tokens,
    );

    const recorded = anthropicUsageModel.record({
      source: 'delegate',
      model: response.model ?? model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      cost_usd_micros: costMicros,
      request_id: response.id ?? null,
      task_summary: input.task_summary ?? null,
    });

    return {
      ok: true,
      content,
      model: response.model ?? model,
      usage,
      request_id: response.id ?? null,
      cost_usd: recorded.cost_usd,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Record the failure so cost diagnostics show error rates.
    anthropicUsageModel.record({
      source: 'delegate',
      model,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd_micros: 0,
      task_summary: input.task_summary ?? null,
      error: errorMessage,
    });
    return { ok: false, error: errorMessage };
  }
}

// ---------------------------------------------------------------------------
// Agentic delegation loop
// ---------------------------------------------------------------------------

/**
 * Run an agentic coding-assistant loop using the personal Anthropic
 * subscription. The loop calls `messages.create` repeatedly until the model
 * returns `stop_reason === 'end_turn'` or we hit max_iterations.
 *
 * Each API turn is recorded in `anthropic_usage_events` with source='delegate'.
 *
 * Returns `{ ok: true, transcript, total_usage, total_cost_usd, ... }` or
 * `{ ok: false, error, transcript_so_far, total_usage }`. HTTP 200 in both
 * cases — the route call succeeded; the agentic run may not have.
 */
export async function delegateAgentic(input: AgenticDelegateRequest): Promise<AgenticResult> {
  const model = input.model && input.model.length > 0 ? input.model : DEFAULT_MODEL;
  const maxTokens = Math.min(input.max_tokens ?? DEFAULT_MAX_TOKENS, HARD_MAX_TOKENS);
  const maxIter = Math.min(
    input.max_iterations ?? DEFAULT_MAX_ITERATIONS,
    HARD_MAX_ITERATIONS,
  );

  // -- Resolve working_dir (throws HttpError on bad config)
  let workingDir: string;
  try {
    workingDir = resolveWorkingDir(input.working_dir);
  } catch (err) {
    throw err; // propagate HttpError to route
  }

  // -- Validate tools (throws HttpError on unknown tool name)
  let requestedTools: AllowedToolName[];
  try {
    requestedTools = validateRequestedTools(input.tools);
  } catch (err) {
    throw err;
  }

  // -- Get Anthropic client (throws HttpError if key missing)
  let client: Anthropic;
  try {
    client = getPersonalClient();
  } catch (err) {
    throw err;
  }

  // -- Tool definitions for Anthropic
  const toolDefs = buildToolDefinitions(requestedTools);

  // -- State
  const transcript: TranscriptEntry[] = [];
  const totalUsage = emptyUsage();
  let totalCostMicros = 0;
  let iterations = 0;

  // Audit callback: appends an audit entry to the transcript.
  const audit = (entry: AuditEntry): void => {
    transcript.push({ kind: 'audit', entry });
  };

  const toolCtx = { working_dir: workingDir, audit };

  // Build the messages array. Start with the task as the first user message.
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: input.task },
  ];

  // Optional system parameter.
  const systemParam: string | undefined = input.system;

  try {
    // -----------------------------------------------------------------------
    // Agentic loop
    // -----------------------------------------------------------------------
    while (iterations < maxIter) {
      iterations += 1;

      // -- Call Anthropic
      const params: Anthropic.Messages.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        messages,
        tools: toolDefs,
      };
      if (systemParam) params.system = systemParam;

      // Cast: the SDK types for non-streaming create return Message.
      const response = await client.messages.create(params) as Anthropic.Messages.Message;

      // -- Accumulate usage for this turn
      const turnUsage = normalizeUsage(response.usage);
      addUsage(totalUsage, turnUsage);
      const turnCostMicros = computeCostMicros(
        response.model ?? model,
        turnUsage.input_tokens,
        turnUsage.output_tokens,
        turnUsage.cache_read_input_tokens,
        turnUsage.cache_creation_input_tokens,
      );
      totalCostMicros += turnCostMicros;

      // -- Record usage for this turn
      anthropicUsageModel.record({
        source: 'delegate',
        model: response.model ?? model,
        input_tokens: turnUsage.input_tokens,
        output_tokens: turnUsage.output_tokens,
        cache_read_input_tokens: turnUsage.cache_read_input_tokens,
        cache_creation_input_tokens: turnUsage.cache_creation_input_tokens,
        cost_usd_micros: turnCostMicros,
        request_id: response.id ?? null,
        task_summary: input.task_summary ?? null,
      });

      // -- Parse assistant content blocks into transcript
      const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          transcript.push({ kind: 'assistant_text', text: block.text });
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
          transcript.push({
            kind: 'assistant_tool_use',
            id: block.id,
            name: block.name,
            // Cast: Anthropic types input as object; we treat as Record<string,unknown>.
            input: block.input as Record<string, unknown>,
          });
        }
      }

      // -- Append assistant turn to messages history
      messages.push({ role: 'assistant', content: response.content });

      // -- Check stop reason
      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        // Done.
        return {
          ok: true,
          transcript,
          total_usage: totalUsage,
          total_cost_usd: totalCostMicros / 1_000_000,
          iterations,
          stopped_reason: 'end_turn',
        };
      }

      // -- Execute tool calls and build tool_result user message
      const toolResultContents: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        const toolName = toolBlock.name as AllowedToolName;

        // Check if the tool was requested (opt-in check).
        if (!(requestedTools as string[]).includes(toolName)) {
          const errContent = JSON.stringify({
            error: `Tool '${toolName}' was not enabled for this run. Enabled tools: ${requestedTools.join(', ')}.`,
          });
          transcript.push({
            kind: 'tool_result',
            tool_use_id: toolBlock.id,
            content: errContent,
            is_error: true,
          });
          toolResultContents.push({
            type: 'tool_result' as const,
            tool_use_id: toolBlock.id,
            is_error: true,
            content: errContent,
          });
          continue;
        }

        const tool = SUBAGENT_TOOLS[toolName];
        if (!tool) {
          const errContent = JSON.stringify({ error: `Unknown tool: ${toolName}` });
          transcript.push({
            kind: 'tool_result',
            tool_use_id: toolBlock.id,
            content: errContent,
            is_error: true,
          });
          toolResultContents.push({
            type: 'tool_result' as const,
            tool_use_id: toolBlock.id,
            is_error: true,
            content: errContent,
          });
          continue;
        }

        // Execute the tool. The handler always returns a JSON string (errors are
        // also JSON { error: "..." } and written to the audit log inside handler).
        const resultContent = await tool.handler(
          toolBlock.input as Record<string, unknown>,
          toolCtx,
        );

        // Detect if the handler returned an error JSON.
        let isError = false;
        try {
          const parsed = JSON.parse(resultContent) as unknown;
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'error' in (parsed as Record<string, unknown>)
          ) {
            isError = true;
          }
        } catch {
          // non-JSON result — treat as success
        }

        transcript.push({
          kind: 'tool_result',
          tool_use_id: toolBlock.id,
          content: resultContent,
          is_error: isError,
        });

        toolResultContents.push({
          type: 'tool_result' as const,
          tool_use_id: toolBlock.id,
          is_error: isError,
          content: resultContent,
        });
      }

      // Append tool results as a new user message.
      messages.push({ role: 'user', content: toolResultContents });
    }

    // Exhausted max iterations.
    return {
      ok: false,
      error: `Agentic run stopped after reaching max_iterations (${maxIter}).`,
      transcript_so_far: transcript,
      total_usage: totalUsage,
    };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Record the failure turn (cost already accumulated for successful turns above).
    anthropicUsageModel.record({
      source: 'delegate',
      model,
      input_tokens: 0,
      output_tokens: 0,
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
