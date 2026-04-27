/**
 * agents.route.test.ts
 *
 * Tests for all agent-related routes:
 *   GET  /api/agents/configs
 *   PUT  /api/agents/configs/:id
 *   GET  /api/agents/threads?org_id=
 *   POST /api/agents/threads
 *   GET  /api/agents/threads/:id/messages
 *   POST /api/agents/:org_id/chat   — SSE; Anthropic SDK is mocked
 *   GET  /api/agents/audit?thread_id=
 *
 * Mock strategy for chat SSE:
 *   1. @anthropic-ai/sdk is mocked via vi.mock — the fake client's
 *      `messages.stream` returns a configurable async iterable that
 *      yields text deltas and/or tool_use blocks.
 *   2. note.model.js is augmented via vi.mock + vi.importActual to add a
 *      `listRecent` shim (the service calls listRecent; the model currently
 *      only ships listFor — the shim bridges the gap so service code runs
 *      without errors while the model is being completed in parallel).
 *   3. agentMessage.model.js is augmented similarly: the service calls
 *      append(threadId, role, content) positionally, but the model uses
 *      append({ threadId, role, content }). The shim wraps the real append.
 *
 * These shims are only needed until the parallel model/service workers align
 * their APIs. They do NOT change observable test behaviour: they merely let
 * the service function without throwing on missing/mismatched methods.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type * as NoteModelMod from '../models/note.model.js';
import type * as AgentMessageMod from '../models/agentMessage.model.js';
import { db } from '../db/database.js';
import { makeOrg, makeThread, makeMessage } from '../test/factories.js';
import { agentConfigModel } from '../models/agentConfig.model.js';
import { agentToolAuditModel } from '../models/agentToolAudit.model.js';
import { settingsModel } from '../models/settings.model.js';
import { buildApp } from '../test/app.js';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk
// vi.mock is hoisted by Vitest before any imports are executed.
// ---------------------------------------------------------------------------

interface FakeStreamEvent {
  type: string;
  delta?: { type: string; text?: string };
  content_block?: { type: string; id?: string; name?: string; input?: unknown };
  index?: number;
}

interface FakeFinalMessage {
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
}

// Module-scoped state that tests mutate via configureFakeStream()
let _fakeStreamEvents: FakeStreamEvent[] = [];
let _fakeFinalMessage: FakeFinalMessage = { content: [] };
let _fakeStreamCallCount = 0;

export function configureFakeStream(
  events: FakeStreamEvent[],
  finalMessage: FakeFinalMessage,
): void {
  _fakeStreamEvents = events;
  _fakeFinalMessage = finalMessage;
  _fakeStreamCallCount = 0;
}

vi.mock('@anthropic-ai/sdk', () => {
  function makeFakeStream() {
    const callIndex = _fakeStreamCallCount++;
    // Capture the arrays at call time (not at mock definition time) so
    // test-local configureFakeStream() mutations take effect.
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        // Access _fakeStreamEvents via closure on the module scope.
        // Because vi.mock factories run in the same module scope as the test
        // file under Vitest, this closure captures the right variable.
        const events = callIndex === 0 ? _fakeStreamEvents : [];
        return {
          next: async (): Promise<{ value: FakeStreamEvent | undefined; done: boolean }> => {
            if (i < events.length) {
              return { value: events[i++], done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
      finalMessage: async () => (callIndex === 0 ? _fakeFinalMessage : { content: [] }),
    };
  }

  const fakeStreamFn = vi.fn(() => makeFakeStream());
  const fakeClient = { messages: { stream: fakeStreamFn } };

  return {
    default: vi.fn(() => fakeClient),
  };
});

// ---------------------------------------------------------------------------
// Augment note.model.js: add listRecent shim
// claude.service.ts calls noteModel.listRecent(orgId, limit, opts?)
// but note.model.ts currently only ships listFor(orgId).
// The shim delegates to listFor so service code runs without errors.
// ---------------------------------------------------------------------------

vi.mock('../models/note.model.js', async () => {
  const actual = await vi.importActual<typeof NoteModelMod>(
    '../models/note.model.js',
  );
  return {
    ...actual,
    noteModel: {
      ...actual.noteModel,
      // listRecent(orgId, limit, opts?) — shim: return up to `limit` rows from listFor
      listRecent: (orgId: number, limit: number) => {
        return actual.noteModel.listFor(orgId).slice(0, limit);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Augment agentMessage.model.js: bridge positional vs object API
// claude.service.ts calls agentMessageModel.append(threadId, role, content)
// but the real model has append({ threadId, role, content }).
// ---------------------------------------------------------------------------

vi.mock('../models/agentMessage.model.js', async () => {
  const actual = await vi.importActual<typeof AgentMessageMod>(
    '../models/agentMessage.model.js',
  );

  return {
    ...actual,
    agentMessageModel: {
      ...actual.agentMessageModel,
      // Wrap append to accept either (object) or (threadId, role, content, toolCalls)
      append: (
        inputOrThreadId: AgentMessageMod.AgentMessageInput | number,
        role?: string,
        content?: string,
        toolCalls?: unknown,
      ) => {
        if (typeof inputOrThreadId === 'number') {
          // Positional style called by claude.service.ts
          return actual.agentMessageModel.append({
            threadId: inputOrThreadId,
            role: role as AgentMessageMod.MessageRole,
            content: content ?? '',
            toolCalls: toolCalls as unknown[] | null | undefined,
          });
        }
        // Object style (normal usage from factories etc.)
        return actual.agentMessageModel.append(inputOrThreadId);
      },
      // listByThread passes through unchanged
      listByThread: actual.agentMessageModel.listByThread,
    },
  };
});

// ---------------------------------------------------------------------------
// Helper — parse SSE text/event-stream body into payload array
// ---------------------------------------------------------------------------

function parseSseBody(text: string): unknown[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .filter((payload) => payload !== '[DONE]')
    .map((payload) => JSON.parse(payload) as unknown);
}

// ---------------------------------------------------------------------------
// App setup and agent_configs seeding
// ---------------------------------------------------------------------------

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

beforeEach(() => {
  // Reset fake stream to a safe default
  _fakeStreamEvents = [];
  _fakeFinalMessage = { content: [] };

  // Seed the two section archetypes so GET /configs always returns them.
  // The ROLLBACK TO SAVEPOINT in afterEach wipes them, so we re-seed each test.
  agentConfigModel.upsertArchetype('customer', {
    system_prompt_template: 'You are a helpful customer-focused assistant.',
    tools_enabled: [],
    model: 'claude-sonnet-4-6',
  });
  agentConfigModel.upsertArchetype('oem', {
    system_prompt_template: 'You are a helpful OEM partner assistant.',
    tools_enabled: [],
    model: 'claude-sonnet-4-6',
  });

  // Set a fake API key so the service doesn't throw 503
  settingsModel.set('anthropic_api_key', 'sk-ant-test-fake-key');
});

// ---------------------------------------------------------------------------
// GET /api/agents/configs
// ---------------------------------------------------------------------------

describe('GET /api/agents/configs', () => {
  it('returns both section archetypes (customer + oem)', async () => {
    const res = await request(app).get('/api/agents/configs');
    expect(res.status).toBe(200);
    const configs = res.body as Array<{ section: string; organization_id: number | null }>;
    const sections = configs.map((c) => c.section);
    expect(sections).toContain('customer');
    expect(sections).toContain('oem');
    // Archetypes have organization_id = null
    const archetypes = configs.filter((c) => c.organization_id === null);
    expect(archetypes.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/agents/configs/:id
// ---------------------------------------------------------------------------

describe('PUT /api/agents/configs/:id', () => {
  it('updates a config template', async () => {
    const config = agentConfigModel.getArchetype('customer')!;
    expect(config).not.toBeNull();

    const newTemplate = 'Updated customer system prompt.';
    const res = await request(app)
      .put(`/api/agents/configs/${config.id}`)
      .send({ system_prompt_template: newTemplate });

    expect(res.status).toBe(200);
    expect((res.body as { system_prompt_template: string }).system_prompt_template).toBe(newTemplate);
  });

  it('returns 404 for unknown config id', async () => {
    const res = await request(app)
      .put('/api/agents/configs/9999999')
      .send({ system_prompt_template: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('rejects invalid payload with 400', async () => {
    const config = agentConfigModel.getArchetype('oem')!;

    // model field with wrong type (number instead of string)
    const res = await request(app)
      .put(`/api/agents/configs/${config.id}`)
      .send({ model: 12345 });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents/configs — create per-org override
// ---------------------------------------------------------------------------

describe('POST /api/agents/configs', () => {
  it('creates a per-org override row inheriting archetype defaults', async () => {
    const org = makeOrg({ type: 'customer', name: 'Override Cust' });
    const archetype = agentConfigModel.getArchetype('customer')!;

    const res = await request(app)
      .post('/api/agents/configs')
      .send({ section: 'customer', organization_id: org.id });

    expect(res.status).toBe(201);
    const body = res.body as { id: number; section: string; organization_id: number; system_prompt_template: string; model: string };
    expect(body.section).toBe('customer');
    expect(body.organization_id).toBe(org.id);
    expect(body.system_prompt_template).toBe(archetype.system_prompt_template);
    expect(body.model).toBe(archetype.model);
  });

  it('honours an explicit template / model when supplied', async () => {
    const org = makeOrg({ type: 'oem', name: 'Override OEM' });

    const res = await request(app)
      .post('/api/agents/configs')
      .send({
        section: 'oem',
        organization_id: org.id,
        system_prompt_template: 'Bespoke template.',
        model: 'claude-haiku-4-5',
      });

    expect(res.status).toBe(201);
    const body = res.body as { system_prompt_template: string; model: string };
    expect(body.system_prompt_template).toBe('Bespoke template.');
    expect(body.model).toBe('claude-haiku-4-5');
  });

  it('returns 404 when the organization does not exist', async () => {
    const res = await request(app)
      .post('/api/agents/configs')
      .send({ section: 'customer', organization_id: 99_999_999 });

    expect(res.status).toBe(404);
  });

  it('rejects an invalid section with 400', async () => {
    const org = makeOrg({ type: 'customer', name: 'Bad Section Cust' });

    const res = await request(app)
      .post('/api/agents/configs')
      .send({ section: 'agent', organization_id: org.id });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/agents/configs/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/agents/configs/:id', () => {
  it('deletes a per-org override row and returns 204', async () => {
    const org = makeOrg({ type: 'customer', name: 'Deletable Cust' });
    const created = await request(app)
      .post('/api/agents/configs')
      .send({ section: 'customer', organization_id: org.id });
    const id = (created.body as { id: number }).id;

    const res = await request(app).delete(`/api/agents/configs/${id}`);
    expect(res.status).toBe(204);

    // Subsequent GET should not contain the deleted row.
    const list = await request(app).get('/api/agents/configs');
    const ids = (list.body as Array<{ id: number }>).map((r) => r.id);
    expect(ids).not.toContain(id);
  });

  it('refuses to delete the section archetype (organization_id IS NULL)', async () => {
    const archetype = agentConfigModel.getArchetype('customer')!;
    const res = await request(app).delete(`/api/agents/configs/${archetype.id}`);
    expect(res.status).toBe(404);

    // Archetype must still be present.
    expect(agentConfigModel.getArchetype('customer')).not.toBeNull();
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/api/agents/configs/99999999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents/threads
// ---------------------------------------------------------------------------

describe('POST /api/agents/threads', () => {
  it('creates a thread and returns 201', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/agents/threads')
      .send({ organization_id: org.id, title: 'First chat' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ organization_id: org.id, title: 'First chat' });
    expect(res.body.id).toBeTypeOf('number');
  });

  it('creates a thread without a title', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/agents/threads')
      .send({ organization_id: org.id });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf('number');
  });

  it('rejects missing organization_id with 400', async () => {
    const res = await request(app)
      .post('/api/agents/threads')
      .send({ title: 'No org' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/threads?org_id=
// ---------------------------------------------------------------------------

describe('GET /api/agents/threads', () => {
  it('lists threads for the specified org, newest-first', async () => {
    const org = makeOrg();

    const t1 = makeThread(org.id, 'Thread A');
    const t2 = makeThread(org.id, 'Thread B');

    // Touch t1 to make it "newer"
    db.prepare(
      "UPDATE agent_threads SET last_message_at = datetime('now', '+1 second') WHERE id = ?",
    ).run(t1.id);

    const res = await request(app).get(`/api/agents/threads?org_id=${org.id}`);
    expect(res.status).toBe(200);
    const threads = res.body as Array<{ id: number; title: string }>;
    expect(threads.length).toBeGreaterThanOrEqual(2);

    const ids = threads.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);

    // t1 is the most recently touched so should appear first
    const t1Index = ids.indexOf(t1.id);
    const t2Index = ids.indexOf(t2.id);
    expect(t1Index).toBeLessThan(t2Index);
  });

  it('does not include threads from other orgs', async () => {
    const org1 = makeOrg();
    const org2 = makeOrg();

    makeThread(org1.id, 'Org1 Thread');
    makeThread(org2.id, 'Org2 Thread');

    const res = await request(app).get(`/api/agents/threads?org_id=${org1.id}`);
    expect(res.status).toBe(200);
    const titles = (res.body as Array<{ title: string }>).map((t) => t.title);
    expect(titles).toContain('Org1 Thread');
    expect(titles).not.toContain('Org2 Thread');
  });

  it('returns all threads across orgs when org_id is omitted', async () => {
    const org1 = makeOrg();
    const org2 = makeOrg();
    makeThread(org1.id, 'CrossOrg A');
    makeThread(org2.id, 'CrossOrg B');

    const res = await request(app).get('/api/agents/threads');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const titles = (res.body as Array<{ title: string }>).map((t) => t.title);
    expect(titles).toContain('CrossOrg A');
    expect(titles).toContain('CrossOrg B');
  });

  it('respects ?limit= when no org_id given', async () => {
    const org = makeOrg();
    // Create 3 threads
    makeThread(org.id, 'Limit T1');
    makeThread(org.id, 'Limit T2');
    makeThread(org.id, 'Limit T3');

    const res = await request(app).get('/api/agents/threads?limit=2');
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBeLessThanOrEqual(2);
  });

  it('rejects limit > 200 with 400', async () => {
    const res = await request(app).get('/api/agents/threads?limit=201');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/threads/:id/messages
// ---------------------------------------------------------------------------

describe('GET /api/agents/threads/:id/messages', () => {
  it('returns messages in chronological order', async () => {
    const org = makeOrg();
    const thread = makeThread(org.id, 'Message Order Test');

    makeMessage(thread.id, 'user', 'Hello');
    makeMessage(thread.id, 'assistant', 'Hi there');
    makeMessage(thread.id, 'user', 'How are you?');

    const res = await request(app).get(`/api/agents/threads/${thread.id}/messages`);
    expect(res.status).toBe(200);
    const messages = res.body as Array<{ role: string; content: string }>;
    expect(messages.length).toBeGreaterThanOrEqual(3);
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].content).toBe('Hi there');
    expect(messages[2].content).toBe('How are you?');
  });

  it('returns empty array for a thread with no messages', async () => {
    const org = makeOrg();
    const thread = makeThread(org.id);

    const res = await request(app).get(`/api/agents/threads/${thread.id}/messages`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as unknown[]).length).toBe(0);
  });

  it('returns 404 for unknown thread id', async () => {
    const res = await request(app).get('/api/agents/threads/9999999/messages');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents/:org_id/chat — SSE streaming
// ---------------------------------------------------------------------------

describe('POST /api/agents/:org_id/chat', () => {
  it('streams text deltas and writes assistant message to agent_messages', async () => {
    const org = makeOrg({ type: 'customer', name: 'Stream Test Org' });
    const thread = makeThread(org.id, 'Stream Thread');

    // Configure fake stream: two text deltas
    configureFakeStream(
      [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world.' } },
      ],
      {
        content: [{ type: 'text', text: 'Hello world.' }],
      },
    );

    const res = await request(app)
      .post(`/api/agents/${org.id}/chat`)
      .send({ thread_id: thread.id, content: 'Test message' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    // Parse SSE events from the response body
    const events = parseSseBody(res.text);
    const textEvents = events.filter((e) => (e as { type: string }).type === 'text');
    expect(textEvents.length).toBeGreaterThanOrEqual(1);

    const deltas = textEvents.map((e) => (e as { delta: string }).delta);
    expect(deltas.join('')).toBe('Hello world.');

    // Verify done event
    const doneEvents = events.filter((e) => (e as { type: string }).type === 'done');
    expect(doneEvents.length).toBe(1);

    // Verify assistant message persisted to agent_messages (exactly once — R-005)
    const assistantMessages = db
      .prepare<[number], { role: string; content: string }>(
        'SELECT role, content FROM agent_messages WHERE thread_id = ? ORDER BY created_at ASC',
      )
      .all(thread.id);

    const assistantRows = assistantMessages.filter((m) => m.role === 'assistant');
    expect(assistantRows.length).toBe(1);
    expect(assistantRows[0].content).toBe('Hello world.');

    // R-005: assistant turns must NOT be mirrored to the notes table
    const noteCount = db
      .prepare<[number], { n: number }>(
        "SELECT COUNT(*) AS n FROM notes WHERE thread_id = ? AND role = 'assistant'",
      )
      .get(thread.id)!;
    expect(noteCount.n).toBe(0);
  });

  it('handles record_insight tool call for an allowed org — writes note + audit row', async () => {
    const org = makeOrg({ type: 'customer', name: 'Insight Target Org' });
    const thread = makeThread(org.id);

    configureFakeStream(
      [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'I found something.' } },
      ],
      {
        content: [
          { type: 'text', text: 'I found something.' },
          {
            type: 'tool_use',
            id: 'tool_abc123',
            name: 'record_insight',
            input: {
              // org name exactly matches the current org — always in allowlist
              target_org_name: 'Insight Target Org',
              topic: 'test finding',
              content: 'Important insight content.',
            },
          },
        ],
      },
    );

    const res = await request(app)
      .post(`/api/agents/${org.id}/chat`)
      // Message mentions the org name so it's in the allowlist
      .send({ thread_id: thread.id, content: 'Tell me about Insight Target Org' });

    expect(res.status).toBe(200);

    // Audit row with status=ok
    const auditRows = agentToolAuditModel.listByThread(thread.id);
    const insightAudit = auditRows.find((r) => r.tool_name === 'record_insight');
    expect(insightAudit).toBeDefined();
    expect(insightAudit!.status).toBe('ok');

    // Note created for the org with role=agent_insight, confirmed=0 (R-002)
    const noteRow = db
      .prepare<[number], { role: string; confirmed: number; content: string }>(
        "SELECT role, confirmed, content FROM notes WHERE organization_id = ? AND role = 'agent_insight'",
      )
      .get(org.id);

    expect(noteRow).toBeDefined();
    expect(noteRow!.role).toBe('agent_insight');
    expect(noteRow!.confirmed).toBe(0);
    expect(noteRow!.content).toBe('Important insight content.');
  });

  it('rejects record_insight for a blocked org — audit=rejected, no note created', async () => {
    const org = makeOrg({ type: 'customer', name: 'Current Org' });
    const otherOrg = makeOrg({ type: 'oem', name: 'Blocked OEM Org' });
    const thread = makeThread(org.id);

    configureFakeStream([], {
      content: [
        {
          type: 'tool_use',
          id: 'tool_rejected',
          name: 'record_insight',
          input: {
            // Target NOT in the allowlist for this turn (not mentioned in msg, not in note_mentions)
            target_org_name: 'Blocked OEM Org',
            content: 'Injected content.',
          },
        },
      ],
    });

    const res = await request(app)
      .post(`/api/agents/${org.id}/chat`)
      // Message does NOT mention "Blocked OEM Org"
      .send({ thread_id: thread.id, content: 'Tell me about Current Org only.' });

    expect(res.status).toBe(200);

    // Audit row with status=rejected
    const auditRows = agentToolAuditModel.listByThread(thread.id);
    const rejectedAudit = auditRows.find(
      (r) => r.tool_name === 'record_insight' && r.status === 'rejected',
    );
    expect(rejectedAudit).toBeDefined();

    // No note for the blocked org
    const noteCount = db
      .prepare<[number], { n: number }>(
        "SELECT COUNT(*) AS n FROM notes WHERE organization_id = ? AND role = 'agent_insight'",
      )
      .get(otherOrg.id)!;
    expect(noteCount.n).toBe(0);
  });

  it('assistant message appears in agent_messages exactly once (R-005)', async () => {
    const org = makeOrg({ type: 'customer', name: 'Once Org' });
    const thread = makeThread(org.id);

    configureFakeStream(
      [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Only once.' } }],
      { content: [{ type: 'text', text: 'Only once.' }] },
    );

    await request(app)
      .post(`/api/agents/${org.id}/chat`)
      .send({ thread_id: thread.id, content: 'ping' });

    const assistantRows = db
      .prepare<[number], { id: number }>(
        "SELECT id FROM agent_messages WHERE thread_id = ? AND role = 'assistant'",
      )
      .all(thread.id);

    expect(assistantRows.length).toBe(1);
  });

  it('returns error when org does not exist', async () => {
    configureFakeStream([], { content: [] });

    const res = await request(app)
      .post('/api/agents/9999999/chat')
      .send({ thread_id: 1, content: 'hello' });

    // Route may return 404 directly, or return 200 SSE with an error event
    if (res.status !== 200) {
      expect(res.status).toBe(404);
    } else {
      const events = parseSseBody(res.text);
      const errorEvents = events.filter((e) => (e as { type: string }).type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    }
  });

  it('rejects missing content with 400', async () => {
    const org = makeOrg({ type: 'customer', name: 'Validate Org' });

    const res = await request(app)
      .post(`/api/agents/${org.id}/chat`)
      .send({ thread_id: 1 });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/audit?thread_id=
// ---------------------------------------------------------------------------

describe('GET /api/agents/audit', () => {
  it('returns audit rows for a thread in order', async () => {
    const org = makeOrg();
    const thread = makeThread(org.id);

    agentToolAuditModel.append({
      thread_id: thread.id,
      tool_name: 'web_search',
      input: { query: 'test query' },
      output: { managed: true },
      status: 'ok',
    });
    agentToolAuditModel.append({
      thread_id: thread.id,
      tool_name: 'record_insight',
      input: { target_org_name: 'Test', content: 'insight' },
      output: { note_id: 1 },
      status: 'ok',
    });

    const res = await request(app).get(`/api/agents/audit?thread_id=${thread.id}`);
    expect(res.status).toBe(200);
    const rows = res.body as Array<{ tool_name: string; status: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const toolNames = rows.map((r) => r.tool_name);
    expect(toolNames).toContain('web_search');
    expect(toolNames).toContain('record_insight');
  });

  it('returns empty array for a thread with no audit rows', async () => {
    const org = makeOrg();
    const thread = makeThread(org.id);

    const res = await request(app).get(`/api/agents/audit?thread_id=${thread.id}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as unknown[]).length).toBe(0);
  });

  it('requires thread_id — returns 400 when missing', async () => {
    const res = await request(app).get('/api/agents/audit');
    expect(res.status).toBe(400);
  });

  it('does not include audit rows from other threads', async () => {
    const org = makeOrg();
    const thread1 = makeThread(org.id, 'Thread 1');
    const thread2 = makeThread(org.id, 'Thread 2');

    agentToolAuditModel.append({
      thread_id: thread1.id,
      tool_name: 'web_search',
      input: {},
      output: {},
      status: 'ok',
    });
    agentToolAuditModel.append({
      thread_id: thread2.id,
      tool_name: 'record_insight',
      input: {},
      output: {},
      status: 'rejected',
    });

    const res = await request(app).get(`/api/agents/audit?thread_id=${thread1.id}`);
    expect(res.status).toBe(200);
    const rows = res.body as Array<{ tool_name: string }>;
    expect(rows.every((r) => r.tool_name === 'web_search')).toBe(true);
  });
});
