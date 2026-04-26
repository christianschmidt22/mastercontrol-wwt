/**
 * subagent.service.ts — delegate one-shot tasks to the user's PERSONAL
 * Anthropic subscription (separate from the org-chat key). Records every
 * call in `anthropic_usage_events` so the Agents-page tile can show
 * session/today/week/all-time aggregates.
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
import { settingsModel } from '../models/settings.model.js';
import { anthropicUsageModel } from '../models/anthropicUsage.model.js';
import { computeCostMicros } from '../lib/anthropicPricing.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { DelegateRequest } from '../schemas/subagent.schema.js';

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
