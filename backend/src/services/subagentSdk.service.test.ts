/**
 * subagentSdk.service.test.ts
 *
 * Unit tests for delegateViaSubscription() in subagentSdk.service.ts.
 *
 * We mock @anthropic-ai/claude-agent-sdk so no real CLI subprocess or
 * network calls happen. The mock returns scripted async generators that
 * yield SDKMessage-shaped objects.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import { db } from '../db/database.js';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/claude-agent-sdk BEFORE importing the module under test.
// vi.mock is hoisted by Vitest.
// ---------------------------------------------------------------------------

/**
 * Scripted events for each test. Each test pushes objects (or throw-closures)
 * into this array. The mock `query()` yields them in order.
 */
const mockEvents: Array<Record<string, unknown> | (() => never)> = [];

vi.mock('@anthropic-ai/claude-agent-sdk', () => {
  return {
    query: vi.fn().mockImplementation((_params: unknown) => {
      // Return an async generator that drains mockEvents.
      async function* gen() {
        for (const item of mockEvents) {
          if (typeof item === 'function') {
            item(); // throws
          }
          yield item as Record<string, unknown>;
        }
      }
      return gen();
    }),
  };
});

// Import AFTER the mock is declared (Vitest hoists vi.mock, so this is fine).
import { delegateViaSubscription } from './subagentSdk.service.js';
import { anthropicUsageModel } from '../models/anthropicUsage.model.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssistantEvent(opts: {
  model?: string;
  textBlocks?: string[];
  toolUseBlocks?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  usage?: { input_tokens: number; output_tokens: number };
  error?: string;
}): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  for (const text of opts.textBlocks ?? []) {
    content.push({ type: 'text', text });
  }
  for (const tu of opts.toolUseBlocks ?? []) {
    content.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
  }
  const event: Record<string, unknown> = {
    type: 'assistant',
    message: {
      model: opts.model ?? 'claude-sonnet-4-6',
      content,
      usage: {
        input_tokens: opts.usage?.input_tokens ?? 10,
        output_tokens: opts.usage?.output_tokens ?? 5,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
      },
    },
    parent_tool_use_id: null,
    uuid: 'test-uuid',
    session_id: 'test-session',
  };
  if (opts.error !== undefined) event.error = opts.error;
  return event;
}

function makeResultSuccess(opts: {
  num_turns?: number;
  usage?: { input_tokens: number; output_tokens: number };
  total_cost_usd?: number;
  stop_reason?: string;
}): Record<string, unknown> {
  return {
    type: 'result',
    subtype: 'success',
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: opts.num_turns ?? 1,
    result: 'done',
    stop_reason: opts.stop_reason ?? 'end_turn',
    total_cost_usd: opts.total_cost_usd ?? 0,
    usage: {
      input_tokens: opts.usage?.input_tokens ?? 10,
      output_tokens: opts.usage?.output_tokens ?? 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: 'test-uuid',
    session_id: 'test-session',
  };
}

function makeResultError(subtype: string, errors?: string[]): Record<string, unknown> {
  return {
    type: 'result',
    subtype,
    duration_ms: 500,
    duration_api_ms: 400,
    is_error: true,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0,
    usage: {
      input_tokens: 5,
      output_tokens: 2,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    errors: errors ?? [],
    uuid: 'test-uuid',
    session_id: 'test-session',
  };
}

const WORK_DIR = os.tmpdir();

const BASE_INPUT = {
  task: 'List files in the workspace',
  tools: ['read_file' as const],
  working_dir: WORK_DIR,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockEvents.length = 0;
  db.exec('DELETE FROM anthropic_usage_events');
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('delegateViaSubscription', () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it('happy path: assistant text then result → ok:true, transcript, cost=0 usage recorded', async () => {
    mockEvents.push(
      makeAssistantEvent({
        textBlocks: ['I found the files.'],
        usage: { input_tokens: 20, output_tokens: 8 },
      }),
      makeResultSuccess({
        num_turns: 1,
        usage: { input_tokens: 20, output_tokens: 8 },
        total_cost_usd: 0,
      }),
    );

    const result = await delegateViaSubscription(BASE_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return; // narrow type

    expect(result.stopped_reason).toBe('end_turn');
    expect(result.iterations).toBe(1);
    expect(result.total_cost_usd).toBe(0);
    expect(result.transcript).toHaveLength(1);
    expect(result.transcript[0].kind).toBe('assistant_text');
    if (result.transcript[0].kind === 'assistant_text') {
      expect(result.transcript[0].text).toBe('I found the files.');
    }

    // Usage was recorded with cost=0.
    const events = anthropicUsageModel.recent(5);
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('delegate');
    expect(events[0].cost_usd_micros).toBe(0);
    expect(events[0].input_tokens).toBe(20);
    expect(events[0].output_tokens).toBe(8);
    expect(events[0].error).toBeNull();
  });

  // ── Tool-use loop ─────────────────────────────────────────────────────────

  it('tool-use loop: 2 turns with tool_use → transcript has both kinds, separate turn numbers', async () => {
    mockEvents.push(
      // Turn 1: assistant emits a tool_use block.
      makeAssistantEvent({
        textBlocks: ['Reading the file...'],
        toolUseBlocks: [{ id: 'tu_1', name: 'Read', input: { file_path: 'README.md' } }],
        usage: { input_tokens: 15, output_tokens: 6 },
      }),
      // Turn 2: assistant emits text after tool result.
      makeAssistantEvent({
        textBlocks: ['Done! The README says hello.'],
        usage: { input_tokens: 25, output_tokens: 10 },
      }),
      makeResultSuccess({
        num_turns: 2,
        usage: { input_tokens: 40, output_tokens: 16 },
      }),
    );

    const result = await delegateViaSubscription(BASE_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const transcript = result.transcript;
    // turn 1: assistant_text + assistant_tool_use
    // turn 2: assistant_text
    expect(transcript.length).toBe(3);

    const textEntries = transcript.filter((e) => e.kind === 'assistant_text');
    const toolEntries = transcript.filter((e) => e.kind === 'assistant_tool_use');
    expect(textEntries).toHaveLength(2);
    expect(toolEntries).toHaveLength(1);

    // Check turn numbers were attached.
    expect((textEntries[0] as unknown as { turn: number }).turn).toBe(1);
    expect((toolEntries[0] as unknown as { turn: number }).turn).toBe(1);
    expect((textEntries[1] as unknown as { turn: number }).turn).toBe(2);

    // Tool entry has correct field names (id, name — not tool/tool_use_id).
    const toolEntry = toolEntries[0];
    if (toolEntry.kind === 'assistant_tool_use') {
      expect(toolEntry.id).toBe('tu_1');
      expect(toolEntry.name).toBe('Read');
    }

    // One usage row recorded at the end (the result event's usage wins).
    const usageRows = anthropicUsageModel.recent(5);
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0].input_tokens).toBe(40);
  });

  // ── Auth error via SDKAssistantMessage.error field ────────────────────────

  it('auth error via assistant event error flag → ok:false with actionable message, records usage', async () => {
    mockEvents.push(
      makeAssistantEvent({
        error: 'authentication_failed',
        textBlocks: [],
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    );

    const result = await delegateViaSubscription(BASE_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/claude \/login/i);

    const events = anthropicUsageModel.recent(5);
    expect(events).toHaveLength(1);
    expect(events[0].error).toMatch(/claude \/login/i);
    expect(events[0].cost_usd_micros).toBe(0);
  });

  // ── Auth error thrown by SDK ──────────────────────────────────────────────

  it('auth error thrown by SDK (no credentials) → ok:false with actionable message', async () => {
    mockEvents.push(() => {
      throw new Error('no credentials found — run claude /login to authenticate');
    });

    const result = await delegateViaSubscription(BASE_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/claude \/login/i);
  });

  // ── Max turns exceeded ────────────────────────────────────────────────────

  it('max turns exceeded → ok:false with error_max_turns message, records usage', async () => {
    mockEvents.push(
      makeAssistantEvent({ textBlocks: ['Partial work...'] }),
      makeResultError('error_max_turns'),
    );

    const result = await delegateViaSubscription({
      ...BASE_INPUT,
      max_iterations: 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/max_iterations/i);

    const events = anthropicUsageModel.recent(5);
    expect(events).toHaveLength(1);
    expect(events[0].error).toMatch(/max_iterations/i);
    expect(events[0].cost_usd_micros).toBe(0);
  });

  // ── Error during execution (non-auth SDK result error) ────────────────────

  it('error_during_execution result → ok:false with error message', async () => {
    mockEvents.push(
      makeResultError('error_during_execution', ['The tool failed unexpectedly']),
    );

    const result = await delegateViaSubscription(BASE_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/error_during_execution/);
    expect(result.error).toMatch(/The tool failed unexpectedly/);
  });

  // ── Working dir validation ────────────────────────────────────────────────

  it('nonexistent working_dir → HttpError 400 before calling SDK', async () => {
    const { query: mockQuery } = await import('@anthropic-ai/claude-agent-sdk');

    const { HttpError } = await import('../middleware/errorHandler.js');

    let threw: unknown = null;
    try {
      await delegateViaSubscription({
        ...BASE_INPUT,
        working_dir: '/nonexistent-path-xyz-987654/abc',
      });
    } catch (err) {
      threw = err;
    }

    expect(threw).toBeInstanceOf(HttpError);
    const httpErr = threw as InstanceType<typeof HttpError>;
    expect(httpErr.status).toBe(400);
    expect(httpErr.message).toMatch(/working_dir does not exist/i);

    // SDK should never have been called.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── task_summary is recorded ──────────────────────────────────────────────

  it('task_summary is stored in the usage row', async () => {
    mockEvents.push(
      makeAssistantEvent({ textBlocks: ['ok'] }),
      makeResultSuccess({ num_turns: 1 }),
    );

    await delegateViaSubscription({
      ...BASE_INPUT,
      task_summary: 'my-task-label',
    });

    const events = anthropicUsageModel.recent(5);
    expect(events[0].task_summary).toBe('my-task-label');
  });

  // ── max_iterations is capped at HARD_MAX (50) ─────────────────────────────

  it('max_iterations above 50 is not an error at the service level (schema enforces ≤50)', async () => {
    // The schema caps at 50, so service receives a value ≤ 50.
    // Test with max_iterations = 50 (the hard cap) — it should work normally.
    mockEvents.push(
      makeAssistantEvent({ textBlocks: ['done'] }),
      makeResultSuccess({ num_turns: 1 }),
    );

    const result = await delegateViaSubscription({
      ...BASE_INPUT,
      max_iterations: 50,
    });

    expect(result.ok).toBe(true);
  });
});
