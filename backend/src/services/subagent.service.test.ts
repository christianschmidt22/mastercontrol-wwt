/**
 * subagent.service.test.ts
 *
 * Unit tests for delegateAgentic() — specifically the onEvent streaming
 * callback added for SSE support.
 *
 * The @anthropic-ai/sdk mock follows the same pattern as subagent.route.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'node:os';
import { db } from '../db/database.js';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk — vi.mock is hoisted.
// ---------------------------------------------------------------------------

interface FakeMessage {
  id?: string;
  model?: string;
  stop_reason?: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

const mockQueue: Array<FakeMessage | (() => never)> = [];

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = {
        create: vi.fn().mockImplementation(async () => {
          if (mockQueue.length > 0) {
            const next = mockQueue.shift()!;
            if (typeof next === 'function') return next();
            return next;
          }
          return {
            id: 'msg_default',
            model: 'claude-sonnet-4-6',
            content: [{ type: 'text', text: 'default reply' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          };
        }),
      };
    },
  };
});

import { delegateAgentic } from './subagent.service.js';
import { settingsModel } from '../models/settings.model.js';

const WORK_DIR = os.tmpdir();
const BASE_INPUT = {
  task: 'List files in the workspace',
  tools: ['read_file' as const],
  working_dir: WORK_DIR,
};

beforeEach(() => {
  mockQueue.length = 0;
  db.exec('DELETE FROM anthropic_usage_events');
  settingsModel.set('personal_anthropic_api_key', 'sk-test-personal');
});

// ---------------------------------------------------------------------------
// onEvent callback tests
// ---------------------------------------------------------------------------

describe('delegateAgentic — onEvent streaming callback', () => {
  it('fires onEvent for each transcript entry in order during a simple text-only run', async () => {
    mockQueue.push({
      id: 'msg_t1',
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hello from the model.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const events: Array<{ kind: string }> = [];
    const result = await delegateAgentic(BASE_INPUT, {
      onEvent: (entry) => {
        events.push(entry);
      },
    });

    expect(result.ok).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('assistant_text');
  });

  it('fires onEvent for tool_use and tool_result in a two-turn run', async () => {
    // Turn 1: model requests read_file.
    mockQueue.push({
      id: 'msg_t1',
      model: 'claude-sonnet-4-6',
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'tu_001',
          name: 'read_file',
          input: { path: 'README.md' },
        },
      ],
      usage: { input_tokens: 15, output_tokens: 8 },
    });
    // Turn 2: model returns final text.
    mockQueue.push({
      id: 'msg_t2',
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done.' }],
      usage: { input_tokens: 20, output_tokens: 6 },
    });

    const events: Array<{ kind: string }> = [];
    const result = await delegateAgentic(BASE_INPUT, {
      onEvent: (entry) => {
        events.push({ kind: entry.kind });
      },
    });

    expect(result.ok).toBe(true);
    // Filter out audit entries (tool execution audit trail) — focus on the
    // semantic entries: assistant_tool_use → tool_result → assistant_text.
    const semanticKinds = events
      .map((e) => e.kind)
      .filter((k) => k !== 'audit');
    expect(semanticKinds).toEqual(['assistant_tool_use', 'tool_result', 'assistant_text']);
  });

  it('fires onEvent for events emitted before max_iterations error', async () => {
    // Both turns return tool_use to exhaust the loop.
    for (let i = 0; i < 3; i++) {
      mockQueue.push({
        id: `msg_loop_${i}`,
        model: 'claude-sonnet-4-6',
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: `tu_${i}`,
            name: 'read_file',
            input: { path: 'x.txt' },
          },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
      });
    }

    const events: Array<{ kind: string }> = [];
    const result = await delegateAgentic(
      { ...BASE_INPUT, max_iterations: 2 },
      {
        onEvent: (entry) => {
          events.push({ kind: entry.kind });
        },
      },
    );

    expect(result.ok).toBe(false);
    // Each iteration emits assistant_tool_use + audit(s) + tool_result.
    // At minimum: 2 × (assistant_tool_use + tool_result) = 4 non-audit events.
    const nonAuditEvents = events.filter((e) => e.kind !== 'audit');
    expect(nonAuditEvents.length).toBe(4);
    expect(nonAuditEvents.some((e) => e.kind === 'assistant_tool_use')).toBe(true);
    expect(nonAuditEvents.some((e) => e.kind === 'tool_result')).toBe(true);
  });

  it('without onEvent callback, the function behaves identically to before', async () => {
    mockQueue.push({
      id: 'msg_no_cb',
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'No callback test.' }],
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    // No options argument — should not throw.
    const result = await delegateAgentic(BASE_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transcript).toHaveLength(1);
      expect(result.transcript[0]?.kind).toBe('assistant_text');
    }
  });
});

// ---------------------------------------------------------------------------
// Per-call cost cap tests
// ---------------------------------------------------------------------------

describe('delegateAgentic — max_cost_usd cap', () => {
  it('completes normally when cost stays below the cap', async () => {
    // Single text-only turn; cost of 10 input + 5 output tokens for
    // claude-sonnet-4-6 ≈ $0.000105 — well under the $100 cap.
    mockQueue.push({
      id: 'msg_cap_ok',
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done, no problem.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await delegateAgentic({ ...BASE_INPUT, max_cost_usd: 100 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stopped_reason).toBe('end_turn');
      expect(result.total_cost_usd).toBeGreaterThan(0);
      expect(result.total_cost_usd).toBeLessThan(100);
    }
  });

  it('aborts mid-loop with the right error when cost exceeds the cap', async () => {
    // Turn 1 returns tool_use so the loop would normally continue.
    // Cost for 10 input + 5 output on claude-sonnet-4-6 ≈ $0.000105,
    // which exceeds the $0.00001 cap.
    mockQueue.push({
      id: 'msg_cap_exceed_t1',
      model: 'claude-sonnet-4-6',
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'tu_cap_1',
          name: 'read_file',
          input: { path: 'README.md' },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    // Turn 2 should never be reached because the cap triggers after turn 1.
    mockQueue.push({
      id: 'msg_cap_exceed_t2',
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Should not appear.' }],
      usage: { input_tokens: 5, output_tokens: 3 },
    });

    const result = await delegateAgentic({ ...BASE_INPUT, max_cost_usd: 0.00001 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Max cost exceeded/);
      // The transcript should contain the assistant_tool_use from turn 1
      // but no text from the (unreached) turn 2.
      const kinds = result.transcript_so_far.map((e) => e.kind).filter((k) => k !== 'audit');
      expect(kinds).toContain('assistant_tool_use');
      expect(kinds).not.toContain('tool_result'); // aborted before tool execution
    }
    // The abort event must have been recorded with the error message.
    const rows = db
      .prepare("SELECT error FROM anthropic_usage_events WHERE error LIKE 'Max cost%'")
      .all() as Array<{ error: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.error).toMatch(/Max cost exceeded/);
  });

  it('runs without cost enforcement when max_cost_usd is omitted', async () => {
    // Two-turn run — would be aborted by any reasonable cap, but since
    // max_cost_usd is omitted the loop completes normally.
    mockQueue.push({
      id: 'msg_no_cap_t1',
      model: 'claude-sonnet-4-6',
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'tu_no_cap_1',
          name: 'read_file',
          input: { path: 'README.md' },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    mockQueue.push({
      id: 'msg_no_cap_t2',
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Finished.' }],
      usage: { input_tokens: 20, output_tokens: 8 },
    });

    // No max_cost_usd in input.
    const result = await delegateAgentic(BASE_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stopped_reason).toBe('end_turn');
      expect(result.iterations).toBe(2);
    }
  });
});
