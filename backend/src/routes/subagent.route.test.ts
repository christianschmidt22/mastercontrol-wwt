/**
 * subagent.route.test.ts
 *
 * Tests for /api/subagent/* — delegation + usage dashboard endpoints.
 * Mocks @anthropic-ai/sdk so no real network calls happen.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../test/app.js';
import { settingsModel } from '../models/settings.model.js';
import { db } from '../db/database.js';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk — vi.mock is hoisted; declared before imports.
// ---------------------------------------------------------------------------

interface FakeMessage {
  id?: string;
  model?: string;
  content: Array<{ type: 'text'; text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

let mockResponse: FakeMessage | (() => never) = {
  id: 'msg_default',
  model: 'claude-sonnet-4-6',
  content: [{ type: 'text', text: 'default reply' }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = {
        create: vi.fn().mockImplementation(async () => {
          if (typeof mockResponse === 'function') {
            return mockResponse(); // throws
          }
          return mockResponse;
        }),
      };
    },
  };
});

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
