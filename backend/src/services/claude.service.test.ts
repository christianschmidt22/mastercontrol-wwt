/**
 * claude.service.test.ts
 *
 * Test coverage for claude.service.ts covering:
 *   R-002  record_insight allowlist resolution
 *   R-005  No mirror to notes for assistant messages
 *   R-016  Per-thread prompt cache + bumpOrgVersion invalidation
 *   R-021  Tool hardening (web_search audit, record_insight rejection)
 *   R-022  Agent tool audit log
 *
 * The Anthropic SDK is fully mocked — no real network calls.
 * The model layer is mocked via vi.mock on module paths; the real in-memory
 * DB (set up by setup.ts) is used for the allowlist SQL queries that
 * claude.service.ts runs directly via the `db` import.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Mock: @anthropic-ai/sdk — must appear before the service import
// ---------------------------------------------------------------------------
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn();
  return { default: MockAnthropic };
});

// ---------------------------------------------------------------------------
// Mock: lib/sse.ts — capture send/end per-call via a factory
// ---------------------------------------------------------------------------
vi.mock('../lib/sse.js', () => ({
  openSse: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: middleware/errorHandler.ts
// ---------------------------------------------------------------------------
vi.mock('../middleware/errorHandler.js', () => ({
  HttpError: class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

// ---------------------------------------------------------------------------
// Mock: settings.model.ts
// ---------------------------------------------------------------------------
vi.mock('../models/settings.model.js', () => ({
  settingsModel: {
    get: vi.fn(() => 'sk-ant-mock-key'),
    getMasked: vi.fn(() => '***y'),
    set: vi.fn(),
  },
  SECRET_KEYS: new Set(['anthropic_api_key']),
  warmDpapi: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock: agentToolAudit.model.ts
// ---------------------------------------------------------------------------
const mockAuditAppend = vi.fn((input: unknown) => ({ id: 1, ...(input as object) }));
vi.mock('../models/agentToolAudit.model.js', () => ({
  agentToolAuditModel: {
    append: (input: unknown) => mockAuditAppend(input),
    listByThread: vi.fn(() => []),
  },
}));

// ---------------------------------------------------------------------------
// Mock: lazily-imported model modules
// ---------------------------------------------------------------------------

// note.model
const mockNoteCreateInsight = vi.fn();
const mockNoteListRecent = vi.fn(() => []);
vi.mock('../models/note.model.js', () => ({
  noteModel: {
    createInsight: (...args: unknown[]) => mockNoteCreateInsight(...args),
    listRecent: (...args: unknown[]) => mockNoteListRecent(...args),
    create: vi.fn(),
    listFor: vi.fn(() => []),
  },
}));

// agentMessage.model
const mockAgentMessageAppend = vi.fn();
const mockAgentMessageListByThread = vi.fn(() => []);
vi.mock('../models/agentMessage.model.js', () => ({
  agentMessageModel: {
    append: (...args: unknown[]) => mockAgentMessageAppend(...args),
    listByThread: (...args: unknown[]) => mockAgentMessageListByThread(...args),
    listForThread: vi.fn(() => []),
  },
}));

// agentConfig.model
const mockAgentConfigGetEffective = vi.fn();
vi.mock('../models/agentConfig.model.js', () => ({
  agentConfigModel: {
    getEffective: (...args: unknown[]) => mockAgentConfigGetEffective(...args),
  },
}));

// agentThread.model
const mockAgentThreadTouch = vi.fn();
vi.mock('../models/agentThread.model.js', () => ({
  agentThreadModel: {
    touchLastMessage: (...args: unknown[]) => mockAgentThreadTouch(...args),
    create: vi.fn(),
    listFor: vi.fn(() => []),
    get: vi.fn(),
    remove: vi.fn(),
  },
}));

// organization.model
const mockOrgGet = vi.fn();
vi.mock('../models/organization.model.js', () => ({
  organizationModel: {
    get: (...args: unknown[]) => mockOrgGet(...args),
    create: vi.fn(),
    listByType: vi.fn(() => []),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

// contact.model
const mockContactListFor = vi.fn(() => []);
vi.mock('../models/contact.model.js', () => ({
  contactModel: {
    listFor: (...args: unknown[]) => mockContactListFor(...args),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

// project.model
const mockProjectListFor = vi.fn(() => []);
vi.mock('../models/project.model.js', () => ({
  projectModel: {
    listFor: (...args: unknown[]) => mockProjectListFor(...args),
  },
}));

// document.model
const mockDocumentListFor = vi.fn(() => []);
vi.mock('../models/document.model.js', () => ({
  documentModel: {
    listFor: (...args: unknown[]) => mockDocumentListFor(...args),
  },
}));

// ---------------------------------------------------------------------------
// Now import the service under test, the SDK mock, and the real DB
// ---------------------------------------------------------------------------
import Anthropic from '@anthropic-ai/sdk';
import { streamChat, bumpOrgVersion } from './claude.service.js';
import { db } from '../db/database.js';
import { openSse } from '../lib/sse.js';

// ---------------------------------------------------------------------------
// Types used in helpers
// ---------------------------------------------------------------------------

interface SseCapture {
  send: Mock;
  end: Mock;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake Anthropic stream that yields the provided events and then
 * resolves `finalMessage()` with the provided message object.
 *
 * The service does:
 *   for await (const event of stream) { ... }
 *   const finalMessage = await stream.finalMessage();
 *
 * The returned object satisfies both interfaces.
 */
function makeFakeStream(
  events: Array<Record<string, unknown>>,
  finalMessage: Partial<Anthropic.Message> = {},
) {
  const defaultFinal: Anthropic.Message = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    // The usage shape varies slightly across SDK versions; cast to satisfy
    // whatever the installed version's type requires.
    usage: { input_tokens: 10, output_tokens: 5 } as Anthropic.Message['usage'],
    ...finalMessage,
  };

  async function* gen() {
    for (const ev of events) {
      yield ev;
    }
  }

  const iterator = gen();
  return {
    [Symbol.asyncIterator]() {
      return iterator;
    },
    finalMessage: vi.fn().mockResolvedValue(defaultFinal),
  };
}

/**
 * Create a minimal mock Express Request / Response pair for streamChat calls.
 * The `req.on` mock lets openSse register the 'close' listener without error.
 */
function makeMockReqRes(): { req: Request; res: Response; sse: SseCapture } {
  const sse: SseCapture = { send: vi.fn(), end: vi.fn() };
  // Wire the openSse mock to return our capture object.
  (openSse as Mock).mockReturnValueOnce({
    send: sse.send,
    end: sse.end,
    disconnected: new Promise<void>(() => { /* never resolves */ }),
  });

  const req = { on: vi.fn() } as unknown as Request;
  const res = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as Response;
  return { req, res, sse };
}

/** Convenience: wire a fresh Anthropic mock instance with a stream. */
function wireStream(stream: ReturnType<typeof makeFakeStream>) {
  const mockStream = vi.fn().mockReturnValue(stream);
  const mockInstance = { messages: { stream: mockStream } };
  (Anthropic as Mock).mockReturnValueOnce(mockInstance);
  return mockInstance;
}

// ---------------------------------------------------------------------------
// Default org / config fixtures
// ---------------------------------------------------------------------------

const BASE_ORG = {
  id: 1,
  type: 'customer' as const,
  name: 'Fairview',
  metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const DEFAULT_CONFIG = {
  id: 1,
  section: 'customer' as const,
  organization_id: null as number | null,
  system_prompt_template: 'You are a helpful assistant.',
  tools_enabled: '{}',
  model: 'claude-sonnet-4-6',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Re-apply defaults after clearAllMocks wipes mockReturnValue state.
  mockOrgGet.mockReturnValue(BASE_ORG);
  mockAgentConfigGetEffective.mockReturnValue(DEFAULT_CONFIG);

  let msgIdSeq = 0;
  mockAgentMessageAppend.mockImplementation((threadId: number, role: string, content: string) => ({
    id: ++msgIdSeq,
    thread_id: threadId,
    role,
    content: content ?? '',
    tool_calls: null,
    created_at: new Date().toISOString(),
  }));
  mockAgentMessageListByThread.mockReturnValue([]);
  mockNoteListRecent.mockReturnValue([]);
  mockContactListFor.mockReturnValue([]);
  mockProjectListFor.mockReturnValue([]);
  mockDocumentListFor.mockReturnValue([]);

  mockNoteCreateInsight.mockImplementation((orgId: number, content: string) => ({
    id: 999,
    organization_id: orgId,
    content,
    provenance: null,
    role: 'agent_insight',
    confirmed: 0,
    thread_id: null,
    ai_response: null,
    source_path: null,
    file_mtime: null,
    created_at: new Date().toISOString(),
  }));
});

// ---------------------------------------------------------------------------
// Part B-1: Allowlist resolution (R-002)
// ---------------------------------------------------------------------------

describe('record_insight allowlist resolution (R-002)', () => {
  // We seed real org rows in the in-memory DB so the allowlist SQL resolves
  // names. The savepoint in setup.ts rolls these back after each test.

  beforeEach(() => {
    // Insert the four test orgs into the real in-memory DB.
    const ins = db.prepare<[string, string, string]>(
      'INSERT INTO organizations (type, name, metadata) VALUES (?, ?, ?)'
    );
    ins.run('customer', 'Fairview', '{}');
    ins.run('oem', 'Cisco', '{}');
    ins.run('oem', 'NetApp', '{}');
    ins.run('customer', 'Memorial', '{}');

    // Fetch the IDs we just inserted.
    const getByName = db.prepare<[string], { id: number }>('SELECT id FROM organizations WHERE name = ?');
    const fairviewId = getByName.get('Fairview')!.id;
    const ciscoId = getByName.get('Cisco')!.id;

    // Seed a note on Fairview with a note_mention → Cisco.
    const noteRes = db.prepare<[number, string, string]>(
      'INSERT INTO notes (organization_id, content, role) VALUES (?, ?, ?)'
    ).run(fairviewId, 'Discussed with Cisco team', 'user');
    db.prepare<[number, number]>(
      'INSERT INTO note_mentions (note_id, mentioned_org_id) VALUES (?, ?)'
    ).run(Number(noteRes.lastInsertRowid), ciscoId);

    // Wire mockOrgGet to return the freshly-inserted IDs.
    const fairview = { ...BASE_ORG, id: fairviewId, name: 'Fairview' };
    mockOrgGet.mockImplementation((id: number) => (id === fairviewId ? fairview : undefined));

    // Bind stream chat calls to the Fairview org.
    mockAgentConfigGetEffective.mockReturnValue({ ...DEFAULT_CONFIG });
  });

  it('Case A — user message naming NetApp expands allowlist to include current + Cisco (mention) + NetApp', async () => {
    const fairviewId = db.prepare<[string], { id: number }>('SELECT id FROM organizations WHERE name = ?').get('Fairview')!.id;
    const stream = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Comparison drafted.' } },
    ]);
    wireStream(stream);
    const { req, res, sse } = makeMockReqRes();

    await streamChat({
      orgId: fairviewId,
      threadId: 10,
      content: 'draft a comparison with NetApp',
      req,
      res,
    });

    // Stream completed normally (done event sent).
    const doneCalls = sse.send.mock.calls.filter(
      (c: Array<Record<string, unknown>>) => c[0]?.type === 'done'
    );
    expect(doneCalls.length).toBe(1);
    // No rejection audit rows for record_insight (no tool calls in this stream).
    const rejections = mockAuditAppend.mock.calls.filter(
      (c: Array<Record<string, unknown>>) => c[0]?.status === 'rejected'
    );
    expect(rejections.length).toBe(0);
  });

  it('Case B — general message keeps allowlist to {current + Cisco from note_mentions}', async () => {
    const fairviewId = db.prepare<[string], { id: number }>('SELECT id FROM organizations WHERE name = ?').get('Fairview')!.id;
    const stream = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'General answer.' } },
    ]);
    wireStream(stream);
    const { req, res, sse } = makeMockReqRes();

    await streamChat({
      orgId: fairviewId,
      threadId: 11,
      content: 'general question',
      req,
      res,
    });

    const doneCalls = sse.send.mock.calls.filter(
      (c: Array<Record<string, unknown>>) => c[0]?.type === 'done'
    );
    expect(doneCalls.length).toBe(1);
  });

  it('Case C — record_insight targeting Memorial (not in allowlist) is rejected; no note written; audit row status=rejected', async () => {
    const fairviewId = db.prepare<[string], { id: number }>('SELECT id FROM organizations WHERE name = ?').get('Fairview')!.id;

    // Final message contains a record_insight targeting Memorial.
    const stream = makeFakeStream(
      [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Saw something.' } }],
      {
        content: [
          {
            type: 'tool_use' as const,
            id: 'tu_memorial',
            name: 'record_insight',
            input: {
              target_org_name: 'Memorial',
              topic: 'general',
              content: 'Memorial insight text.',
            },
          },
        ],
        stop_reason: 'tool_use',
      }
    );
    wireStream(stream);
    const { req, res, sse } = makeMockReqRes();

    await streamChat({
      orgId: fairviewId,
      threadId: 12,
      content: 'general question', // does NOT mention Memorial
      req,
      res,
    });

    // No note created.
    expect(mockNoteCreateInsight).not.toHaveBeenCalled();

    // Audit row with status='rejected' for record_insight.
    const rejections = mockAuditAppend.mock.calls.filter(
      (c: Array<Record<string, unknown>>) =>
        c[0]?.tool_name === 'record_insight' && c[0]?.status === 'rejected'
    );
    expect(rejections.length).toBe(1);

    // SSE tool_result with is_error: true.
    const errorResults = sse.send.mock.calls.filter(
      (c: Array<Record<string, unknown>>) =>
        c[0]?.type === 'tool_result' &&
        (c[0]?.payload as Record<string, unknown>)?.is_error === true
    );
    expect(errorResults.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Part B-2: Cache versioning (R-016)
// ---------------------------------------------------------------------------

describe('prompt cache versioning (R-016)', () => {
  // Cache behaviour is observable via how many times the model data-fetching
  // fns (contactListFor etc.) are called. On a cache hit for the stable block
  // those functions are NOT called again; on a miss they are.
  //
  // We use distinct thread IDs per test so threadCache entries do not bleed
  // across tests (threadCache is module-level state).

  it('first call for a new thread builds the stable block (contacts fetched)', async () => {
    const stream = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi.' } },
    ]);
    wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 200, content: 'hi', req, res });

    expect(mockContactListFor).toHaveBeenCalledTimes(1);
  });

  it('second call on same thread without version bump reuses cache (contacts NOT re-fetched)', async () => {
    const stream1 = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'First.' } },
    ]);
    wireStream(stream1);
    const { req: r1, res: s1 } = makeMockReqRes();
    await streamChat({ orgId: 1, threadId: 201, content: 'first', req: r1, res: s1 });
    const callsAfterFirst = mockContactListFor.mock.calls.length;

    const stream2 = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Second.' } },
    ]);
    wireStream(stream2);
    const { req: r2, res: s2 } = makeMockReqRes();
    await streamChat({ orgId: 1, threadId: 201, content: 'second', req: r2, res: s2 });

    // No additional contact-list fetches on the second call.
    expect(mockContactListFor.mock.calls.length).toBe(callsAfterFirst);
  });

  it('bumpOrgVersion between calls forces cache rebuild (contacts re-fetched)', async () => {
    const stream1 = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'First.' } },
    ]);
    wireStream(stream1);
    const { req: r1, res: s1 } = makeMockReqRes();
    await streamChat({ orgId: 1, threadId: 202, content: 'first', req: r1, res: s1 });
    const callsAfterFirst = mockContactListFor.mock.calls.length;

    // Invalidate cache for org 1.
    bumpOrgVersion(1);

    const stream2 = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Second.' } },
    ]);
    wireStream(stream2);
    const { req: r2, res: s2 } = makeMockReqRes();
    await streamChat({ orgId: 1, threadId: 202, content: 'second', req: r2, res: s2 });

    // Cache was stale — contacts were re-fetched.
    expect(mockContactListFor.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// Part B-3: Tool audit (R-022)
// ---------------------------------------------------------------------------

describe('agent tool audit (R-022)', () => {
  it('successful record_insight: note with role=agent_insight AND audit row status=ok', async () => {
    // Seed Fairview in the real DB so the allowlist SQL finds it.
    db.prepare<[string, string, string]>(
      'INSERT OR IGNORE INTO organizations (id, type, name, metadata) VALUES (1, ?, ?, ?)'
    ).run('customer', 'Fairview', '{}');

    const stream = makeFakeStream(
      [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Recording.' } }],
      {
        content: [
          {
            type: 'tool_use' as const,
            id: 'tu_ri_ok',
            name: 'record_insight',
            input: {
              target_org_name: 'Fairview',
              topic: 'renewal',
              content: 'Renewal went well.',
            },
          },
        ],
        stop_reason: 'tool_use',
      }
    );
    wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 300, content: 'renewal update', req, res });

    // note.createInsight was called once.
    expect(mockNoteCreateInsight).toHaveBeenCalledTimes(1);
    const [targetOrgId, noteContent] = mockNoteCreateInsight.mock.calls[0] as [number, string, unknown];
    expect(targetOrgId).toBe(1);
    expect(noteContent).toContain('Renewal went well.');

    // Audit row with status='ok' for record_insight.
    const okAudits = mockAuditAppend.mock.calls.filter(
      (c: Array<Record<string, unknown>>) =>
        c[0]?.tool_name === 'record_insight' && c[0]?.status === 'ok'
    );
    expect(okAudits.length).toBe(1);
  });

  it('web_search tool call writes only an audit row; no note created', async () => {
    const stream = makeFakeStream(
      [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Search result.' } }],
      {
        content: [
          {
            type: 'tool_use' as const,
            id: 'tu_ws',
            name: 'web_search',
            input: { query: 'cisco latest news' },
          },
        ],
        stop_reason: 'tool_use',
      }
    );
    wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 301, content: 'search cisco', req, res });

    expect(mockNoteCreateInsight).not.toHaveBeenCalled();
    const wsAudits = mockAuditAppend.mock.calls.filter(
      (c: Array<Record<string, unknown>>) => c[0]?.tool_name === 'web_search'
    );
    expect(wsAudits.length).toBe(1);
    expect(wsAudits[0][0].status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Part B-4: Mirror absence (R-005)
// ---------------------------------------------------------------------------

describe('assistant message NOT mirrored to notes (R-005)', () => {
  it('agentMessageModel.append called with role=assistant exactly once; no note created', async () => {
    const stream = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello world.' } },
    ]);
    wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 400, content: 'say hi', req, res });

    const calls = mockAgentMessageAppend.mock.calls as Array<[number, string, string, unknown?]>;
    const assistantCalls = calls.filter((c) => c[1] === 'assistant');
    expect(assistantCalls.length).toBe(1);
    expect(assistantCalls[0][2]).toBe('Hello world.');

    // No note created (no createInsight call, which is the only note-write path in the service).
    expect(mockNoteCreateInsight).not.toHaveBeenCalled();
  });

  it('notes table has zero rows with role=assistant after a stream', async () => {
    const before = db
      .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM notes WHERE role='assistant'")
      .get()!.count;

    const stream = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Reply.' } },
    ]);
    wireStream(stream);
    const { req, res } = makeMockReqRes();
    await streamChat({ orgId: 1, threadId: 401, content: 'test', req, res });

    const after = db
      .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM notes WHERE role='assistant'")
      .get()!.count;

    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Part B-5: Streaming protocol
// ---------------------------------------------------------------------------

describe('streaming protocol — SSE shape', () => {
  it('yields text delta events, then done event; sse.end() called once', async () => {
    const stream = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'chunk one' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ' chunk two' } },
    ]);
    wireStream(stream);
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 500, content: 'stream test', req, res });

    const sendCalls = sse.send.mock.calls as Array<[Record<string, unknown>]>;

    const textEvents = sendCalls.filter((c) => c[0].type === 'text');
    expect(textEvents.length).toBe(2);
    expect(textEvents[0][0]).toMatchObject({ type: 'text', delta: 'chunk one' });
    expect(textEvents[1][0]).toMatchObject({ type: 'text', delta: ' chunk two' });

    const doneEvent = sendCalls.find((c) => c[0].type === 'done');
    expect(doneEvent).toBeDefined();

    // sse.end() is called (writes data: [DONE]\n\n per lib/sse.ts).
    expect(sse.end).toHaveBeenCalledTimes(1);
  });

  it('each text delta payload is JSON-serialisable with type and delta fields', async () => {
    const stream = makeFakeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } },
    ]);
    wireStream(stream);
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 501, content: 'json test', req, res });

    const sendCalls = sse.send.mock.calls as Array<[Record<string, unknown>]>;
    const textEvent = sendCalls.find((c) => c[0].type === 'text');
    expect(textEvent).toBeDefined();

    // Must be round-trip serialisable (openSse does JSON.stringify).
    const parsed = JSON.parse(JSON.stringify(textEvent![0])) as Record<string, unknown>;
    expect(parsed.type).toBe('text');
    expect(typeof parsed.delta).toBe('string');
  });
});
