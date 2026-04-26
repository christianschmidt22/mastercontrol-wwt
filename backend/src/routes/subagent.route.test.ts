/**
 * subagent.route.test.ts
 *
 * Tests for /api/subagent/* — delegation + usage dashboard endpoints.
 * Mocks @anthropic-ai/sdk so no real network calls happen.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildApp } from '../test/app.js';
import { settingsModel } from '../models/settings.model.js';
import { db } from '../db/database.js';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk — vi.mock is hoisted; declared before imports.
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

/**
 * Single response for one-shot tests. Can be a value or a function that
 * throws (to simulate SDK errors).
 */
let mockResponse: FakeMessage | (() => never) = {
  id: 'msg_default',
  model: 'claude-sonnet-4-6',
  content: [{ type: 'text', text: 'default reply' }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

/**
 * Sequential queue for agentic tests. When non-empty, each `create` call
 * pops from the front of this array instead of using `mockResponse`.
 */
const mockQueue: Array<FakeMessage | (() => never)> = [];

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = {
        create: vi.fn().mockImplementation(async () => {
          // Drain the queue first for agentic / multi-turn tests.
          if (mockQueue.length > 0) {
            const next = mockQueue.shift()!;
            if (typeof next === 'function') return next();
            return next;
          }
          if (typeof mockResponse === 'function') {
            return mockResponse(); // throws
          }
          return mockResponse;
        }),
      };
    },
  };
});

import * as os from 'node:os';

let app: Express;

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(() => {
  // Reset usage table + reset to default success response.
  db.exec('DELETE FROM anthropic_usage_events');
  mockResponse = {
    id: 'msg_default',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: 'default reply' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
  // Clear the sequential queue.
  mockQueue.length = 0;
  // Personal key needs to be set by default; tests can clear it.
  settingsModel.set('personal_anthropic_api_key', 'sk-test-personal');
});

// ---------------------------------------------------------------------------
// POST /api/subagent/delegate
// ---------------------------------------------------------------------------

describe('POST /api/subagent/delegate', () => {
  it('returns 400 when the personal API key is not configured', async () => {
    settingsModel.set('personal_anthropic_api_key', '');
    const res = await request(app)
      .post('/api/subagent/delegate')
      .send({ task: 'hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/personal anthropic api key/i);
  });

  it('returns 400 when task is missing', async () => {
    const res = await request(app)
      .post('/api/subagent/delegate')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when task is empty', async () => {
    const res = await request(app)
      .post('/api/subagent/delegate')
      .send({ task: '' });
    expect(res.status).toBe(400);
  });

  it('returns the assistant text on success', async () => {
    mockResponse = {
      id: 'msg_001',
      model: 'claude-sonnet-4-6',
      content: [{ type: 'text', text: 'hello, world' }],
      usage: { input_tokens: 7, output_tokens: 3 },
    };
    const res = await request(app)
      .post('/api/subagent/delegate')
      .send({ task: 'say hello' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.content).toBe('hello, world');
    expect(res.body.request_id).toBe('msg_001');
    expect(res.body.usage.input_tokens).toBe(7);
    expect(res.body.usage.output_tokens).toBe(3);
    expect(res.body.cost_usd).toBeGreaterThanOrEqual(0);
  });

  it('records the call in anthropic_usage_events', async () => {
    await request(app)
      .post('/api/subagent/delegate')
      .send({ task: 'echo', task_summary: 'short label' });

    const recent = await request(app).get('/api/subagent/usage/recent?limit=5');
    expect(recent.status).toBe(200);
    expect(recent.body).toHaveLength(1);
    expect(recent.body[0].source).toBe('delegate');
    expect(recent.body[0].task_summary).toBe('short label');
    expect(recent.body[0].error).toBeNull();
  });

  it('returns ok=false (status 200) and records the error when SDK throws', async () => {
    mockResponse = (() => {
      throw new Error('Anthropic 529 overloaded');
    });
    const res = await request(app)
      .post('/api/subagent/delegate')
      .send({ task: 'fail me' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/overloaded/i);

    // Failure was recorded for diagnostics.
    const recent = await request(app).get('/api/subagent/usage/recent?limit=5');
    expect(recent.body[0].error).toMatch(/overloaded/i);
    expect(recent.body[0].cost_usd_micros).toBe(0);
  });

  it('rejects max_tokens above the hard ceiling', async () => {
    const res = await request(app)
      .post('/api/subagent/delegate')
      .send({ task: 'too big', max_tokens: 99_999 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/subagent/usage
// ---------------------------------------------------------------------------

describe('GET /api/subagent/usage', () => {
  it('returns 400 when period is missing', async () => {
    const res = await request(app).get('/api/subagent/usage');
    expect(res.status).toBe(400);
  });

  it('returns 400 when period is invalid', async () => {
    const res = await request(app).get('/api/subagent/usage?period=lifetime');
    expect(res.status).toBe(400);
  });

  it('returns zeros when no usage exists', async () => {
    const res = await request(app).get('/api/subagent/usage?period=all');
    expect(res.status).toBe(200);
    expect(res.body.requests).toBe(0);
    expect(res.body.input_tokens).toBe(0);
    expect(res.body.cost_usd).toBe(0);
  });

  it('aggregates after a delegate call', async () => {
    mockResponse = {
      id: 'msg_a',
      model: 'claude-sonnet-4-6',
      content: [{ type: 'text', text: 'reply' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    await request(app).post('/api/subagent/delegate').send({ task: 'X' });

    const res = await request(app).get('/api/subagent/usage?period=session');
    expect(res.status).toBe(200);
    expect(res.body.requests).toBe(1);
    expect(res.body.input_tokens).toBe(100);
    expect(res.body.output_tokens).toBe(50);
    expect(res.body.session_start).toBeTruthy();
  });

  it('all-period returns null session_start', async () => {
    const res = await request(app).get('/api/subagent/usage?period=all');
    expect(res.body.session_start).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /api/subagent/usage/recent
// ---------------------------------------------------------------------------

describe('GET /api/subagent/usage/recent', () => {
  it('returns an empty array when nothing has been recorded', async () => {
    const res = await request(app).get('/api/subagent/usage/recent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('respects ?limit= cap (max 100)', async () => {
    const res = await request(app).get('/api/subagent/usage/recent?limit=200');
    expect(res.status).toBe(400);
  });

  it('returns rows in most-recent-first order after delegate calls', async () => {
    await request(app).post('/api/subagent/delegate').send({ task: 'first',  task_summary: 'A' });
    await request(app).post('/api/subagent/delegate').send({ task: 'second', task_summary: 'B' });
    const res = await request(app).get('/api/subagent/usage/recent?limit=10');
    expect(res.body).toHaveLength(2);
    expect(res.body[0].task_summary).toBe('B');
    expect(res.body[1].task_summary).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// POST /api/subagent/delegate-agentic
// ---------------------------------------------------------------------------

describe('POST /api/subagent/delegate-agentic', () => {
  // Use os.tmpdir() — always exists on any OS.
  const WORK_DIR = os.tmpdir();

  const agenticBody = {
    task: 'list the files in the workspace',
    tools: ['read_file', 'list_files'],
    working_dir: WORK_DIR,
  };

  it('returns 400 when tools array is empty', async () => {
    const res = await request(app)
      .post('/api/subagent/delegate-agentic')
      .send({ task: 'hello', tools: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when tools contains an invalid tool name', async () => {
    const res = await request(app)
      .post('/api/subagent/delegate-agentic')
      .send({ task: 'hello', tools: ['read_file', 'hack_system'] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when personal API key is not configured', async () => {
    settingsModel.set('personal_anthropic_api_key', '');
    const res = await request(app)
      .post('/api/subagent/delegate-agentic')
      .send(agenticBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/personal anthropic api key/i);
  });

  it('returns 400 when max_iterations exceeds 50', async () => {
    const res = await request(app)
      .post('/api/subagent/delegate-agentic')
      .send({ task: 'hello', tools: ['read_file'], max_iterations: 99 });
    expect(res.status).toBe(400);
  });

  it('happy path: one tool_use turn then end_turn returns ok=true transcript', async () => {
    // Create a real temp file for read_file to succeed.
    const tmpFile = path.join(WORK_DIR, 'test-readme-agentic.md');
    fs.writeFileSync(tmpFile, '# Test README\nHello from test.');

    try {
      // Turn 1: model asks to read the temp file.
      mockQueue.push({
        id: 'msg_turn1',
        model: 'claude-sonnet-4-6',
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tu_001',
            name: 'read_file',
            input: { path: 'test-readme-agentic.md' },
          },
        ],
        usage: { input_tokens: 20, output_tokens: 10 },
      });
      // Turn 2: after tool result, model returns final text.
      mockQueue.push({
        id: 'msg_turn2',
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done! Found the README.' }],
        usage: { input_tokens: 30, output_tokens: 15 },
      });

      const res = await request(app)
        .post('/api/subagent/delegate-agentic')
        .send(agenticBody);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.stopped_reason).toBe('end_turn');
      expect(res.body.iterations).toBe(2);

      // Transcript should contain the tool use and the tool result.
      const transcript = res.body.transcript as Array<{ kind: string }>;
      expect(transcript.some((e) => e.kind === 'assistant_tool_use')).toBe(true);
      expect(transcript.some((e) => e.kind === 'tool_result')).toBe(true);
      expect(transcript.some((e) => e.kind === 'assistant_text')).toBe(true);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  });

  it('records separate usage rows for each turn', async () => {
    const tmpFile = path.join(WORK_DIR, 'test-agentic-usage.md');
    fs.writeFileSync(tmpFile, 'content');

    try {
      mockQueue.push({
        id: 'msg_t1',
        model: 'claude-sonnet-4-6',
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_x', name: 'read_file', input: { path: 'test-agentic-usage.md' } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      mockQueue.push({
        id: 'msg_t2',
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'done' }],
        usage: { input_tokens: 15, output_tokens: 8 },
      });

      await request(app)
        .post('/api/subagent/delegate-agentic')
        .send({ task: 'do it', tools: ['read_file'], working_dir: WORK_DIR, task_summary: 'multi-turn' });

      const recent = await request(app).get('/api/subagent/usage/recent?limit=10');
      // Expect 2 usage rows (one per turn).
      expect(recent.body).toHaveLength(2);
      expect(recent.body[0].task_summary).toBe('multi-turn');
      expect(recent.body[1].task_summary).toBe('multi-turn');
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  });

  it('tool not in allowed list: model requests bash but bash not enabled — error block returned, loop continues', async () => {
    // Turn 1: model uses bash (not enabled in this request).
    mockQueue.push({
      id: 'msg_t1',
      model: 'claude-sonnet-4-6',
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_bash', name: 'bash', input: { command: 'echo hi' } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    // Turn 2: after error block, model recovers with text response.
    mockQueue.push({
      id: 'msg_t2',
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'I cannot run bash in this context.' }],
      usage: { input_tokens: 15, output_tokens: 8 },
    });

    const res = await request(app)
      .post('/api/subagent/delegate-agentic')
      .send({ task: 'run a command', tools: ['read_file'], working_dir: WORK_DIR });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const transcript = res.body.transcript as Array<{ kind: string; is_error?: boolean }>;
    const toolResult = transcript.find((e) => e.kind === 'tool_result');
    expect(toolResult?.is_error).toBe(true);
  });

  it('max_iterations exceeded returns ok=false with error message', async () => {
    // Every call returns tool_use so loop never ends naturally.
    // Set max_iterations=2 and provide enough queued responses.
    const tmpFile = path.join(WORK_DIR, 'test-loop-file.md');
    fs.writeFileSync(tmpFile, 'x');

    try {
      for (let i = 0; i < 3; i++) {
        mockQueue.push({
          id: `msg_loop_${i}`,
          model: 'claude-sonnet-4-6',
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: `tu_${i}`, name: 'read_file', input: { path: 'test-loop-file.md' } }],
          usage: { input_tokens: 5, output_tokens: 3 },
        });
      }

      const res = await request(app)
        .post('/api/subagent/delegate-agentic')
        .send({ task: 'loop forever', tools: ['read_file'], working_dir: WORK_DIR, max_iterations: 2 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toMatch(/max_iterations/);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  });

  it('SDK error on agentic call returns ok=false (status 200) and records error in usage', async () => {
    mockResponse = (() => {
      throw new Error('Anthropic 503 service unavailable');
    });

    const res = await request(app)
      .post('/api/subagent/delegate-agentic')
      .send(agenticBody);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/503/);

    const recent = await request(app).get('/api/subagent/usage/recent?limit=5');
    expect(recent.body[0].error).toMatch(/503/);
  });
});

// ---------------------------------------------------------------------------
// POST /api/subagent/delegate-sdk
// ---------------------------------------------------------------------------

// Mock the SDK service so no real CLI subprocess is invoked.
// vi.mock is hoisted; the factory receives no outer scope, so we return a
// plain vi.fn() here and configure it in each test via vi.mocked().
vi.mock('../services/subagentSdk.service.js', () => ({
  delegateViaSubscription: vi.fn(),
}));

// Import the mocked module so we can reconfigure it per-test.
import { delegateViaSubscription } from '../services/subagentSdk.service.js';
import type { AgenticStreamOptions } from '../services/subagent.service.js';

describe('POST /api/subagent/delegate-sdk', () => {
  const SDK_BODY = {
    task: 'List the top-level files',
    tools: ['read_file'],
    working_dir: os.tmpdir(),
  };

  const DEFAULT_SUCCESS = {
    ok: true as const,
    transcript: [{ kind: 'assistant_text' as const, text: 'done' }],
    total_usage: { input_tokens: 5, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    total_cost_usd: 0,
    iterations: 1,
    stopped_reason: 'end_turn' as const,
  };

  beforeEach(() => {
    vi.mocked(delegateViaSubscription).mockResolvedValue(DEFAULT_SUCCESS);
  });

  it('returns 400 when tools array is empty', async () => {
    const res = await request(app)
      .post('/api/subagent/delegate-sdk')
      .send({ task: 'hello', tools: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when tools contains an invalid tool name', async () => {
    const res = await request(app)
      .post('/api/subagent/delegate-sdk')
      .send({ task: 'hello', tools: ['read_file', 'inject_sql'] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when max_iterations exceeds 50', async () => {
    const res = await request(app)
      .post('/api/subagent/delegate-sdk')
      .send({ task: 'hello', tools: ['read_file'], max_iterations: 99 });
    expect(res.status).toBe(400);
  });

  it('happy path: returns ok=true with transcript from the service', async () => {
    vi.mocked(delegateViaSubscription).mockResolvedValue({
      ok: true,
      transcript: [{ kind: 'assistant_text', text: 'All files listed.' }],
      total_usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      total_cost_usd: 0,
      iterations: 1,
      stopped_reason: 'end_turn',
    });

    const res = await request(app)
      .post('/api/subagent/delegate-sdk')
      .send(SDK_BODY);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.stopped_reason).toBe('end_turn');
    expect(res.body.transcript[0].text).toBe('All files listed.');
    expect(res.body.total_cost_usd).toBe(0);
  });

  it('returns ok=false (status 200) when service returns an auth error', async () => {
    vi.mocked(delegateViaSubscription).mockResolvedValue({
      ok: false,
      error: 'Claude.ai subscription not authenticated. Run `claude /login` first to authorize MasterControl to use your subscription.',
      transcript_so_far: [],
      total_usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    const res = await request(app)
      .post('/api/subagent/delegate-sdk')
      .send(SDK_BODY);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/claude \/login/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/subagent/delegate-agentic-stream
// ---------------------------------------------------------------------------

/** Parse a text/event-stream body into individual JSON payloads (excluding [DONE]). */
function parseSSEBody(body: string): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) continue;
    const payload = trimmed.slice(6);
    if (payload === '[DONE]') continue;
    try {
      result.push(JSON.parse(payload) as Record<string, unknown>);
    } catch {
      // skip malformed
    }
  }
  return result;
}

describe('POST /api/subagent/delegate-agentic-stream', () => {
  const WORK_DIR = os.tmpdir();
  const STREAM_BODY = {
    task: 'list files',
    tools: ['read_file'],
    working_dir: WORK_DIR,
  };

  it('happy path: SSE stream contains transcript events then a done event', async () => {
    // Single end_turn response — no tool use.
    mockQueue.push({
      id: 'msg_stream_1',
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'All done via stream.' }],
      usage: { input_tokens: 12, output_tokens: 6 },
    });

    const res = await request(app)
      .post('/api/subagent/delegate-agentic-stream')
      .send(STREAM_BODY)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events = parseSSEBody(res.body as string);
    const transcriptEvents = events.filter((e) => e.type === 'transcript');
    const doneEvent = events.find((e) => e.type === 'done');

    expect(transcriptEvents.length).toBeGreaterThanOrEqual(1);
    const firstEntry = transcriptEvents[0]?.entry as Record<string, unknown>;
    expect(firstEntry?.kind).toBe('assistant_text');
    expect(firstEntry?.text).toBe('All done via stream.');

    expect(doneEvent).toBeDefined();
    expect(doneEvent?.stopped_reason).toBe('end_turn');
    expect(typeof doneEvent?.iterations).toBe('number');
    expect(typeof doneEvent?.total_cost_usd).toBe('number');
  });

  it('error path: when personal API key missing, SSE stream contains error event', async () => {
    settingsModel.set('personal_anthropic_api_key', '');

    const res = await request(app)
      .post('/api/subagent/delegate-agentic-stream')
      .send(STREAM_BODY)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    // Status 200 because SSE headers were already sent (openSse was called
    // before the error was raised by delegateAgentic).
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events = parseSSEBody(res.body as string);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(String(errorEvent?.error)).toMatch(/personal anthropic api key/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/subagent/delegate-sdk-stream
// ---------------------------------------------------------------------------

describe('POST /api/subagent/delegate-sdk-stream', () => {
  const SDK_STREAM_BODY = {
    task: 'List top-level files',
    tools: ['read_file'],
    working_dir: os.tmpdir(),
  };

  beforeEach(() => {
    // Default to a simple success; tests override as needed.
    vi.mocked(delegateViaSubscription).mockResolvedValue({
      ok: true,
      transcript: [{ kind: 'assistant_text' as const, text: 'stream done' }],
      total_usage: { input_tokens: 5, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      total_cost_usd: 0,
      iterations: 1,
      stopped_reason: 'end_turn' as const,
    });
  });

  it('happy path: SSE stream contains transcript events then a done event', async () => {
    // Use a mock implementation that calls onEvent before resolving.
    vi.mocked(delegateViaSubscription).mockImplementation(
      async (_input, opts?: AgenticStreamOptions) => {
        opts?.onEvent?.({ kind: 'assistant_text', text: 'SDK stream reply' });
        return {
          ok: true,
          transcript: [{ kind: 'assistant_text' as const, text: 'SDK stream reply' }],
          total_usage: { input_tokens: 8, output_tokens: 4, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          total_cost_usd: 0,
          iterations: 1,
          stopped_reason: 'end_turn' as const,
        };
      },
    );

    const res = await request(app)
      .post('/api/subagent/delegate-sdk-stream')
      .send(SDK_STREAM_BODY)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events = parseSSEBody(res.body as string);
    const transcriptEvents = events.filter((e) => e.type === 'transcript');
    const doneEvent = events.find((e) => e.type === 'done');

    expect(transcriptEvents.length).toBe(1);
    const entry = transcriptEvents[0]?.entry as Record<string, unknown>;
    expect(entry?.kind).toBe('assistant_text');
    expect(entry?.text).toBe('SDK stream reply');

    expect(doneEvent).toBeDefined();
    expect(doneEvent?.stopped_reason).toBe('end_turn');
  });

  it('error path: when service returns ok=false, SSE stream contains error event', async () => {
    vi.mocked(delegateViaSubscription).mockResolvedValue({
      ok: false,
      error: 'Subscription expired.',
      transcript_so_far: [],
      total_usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    const res = await request(app)
      .post('/api/subagent/delegate-sdk-stream')
      .send(SDK_STREAM_BODY)
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events = parseSSEBody(res.body as string);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(String(errorEvent?.error)).toMatch(/subscription expired/i);
  });
});
