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
