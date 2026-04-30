/**
 * claude.service.tools.test.ts — Phase 2 § Step 7 agent-tool coverage.
 *
 * Tests the four Phase 2 tool handlers wired into streamChat():
 *   - search_notes
 *   - list_documents
 *   - read_document     (incl. R-024 safe-path rejection of '..')
 *   - create_task       (incl. service-layer cross-org validation)
 *
 * Approach mirrors claude.service.test.ts: the Anthropic SDK and lib/sse are
 * mocked, model modules are mocked with vi.fn(), and the in-memory DB is
 * available for any tests that need real schema (we don't here — handlers are
 * driven entirely through mocks). Each test wires a fake stream whose
 * finalMessage carries the desired tool_use block and asserts:
 *
 *   1. The relevant model method was called with normalised input.
 *   2. agentToolAuditModel.append was called with the correct tool_name +
 *      status (R-022).
 *   3. An SSE tool_result was emitted (with is_error: true on failure paths).
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Mock: @anthropic-ai/sdk
// ---------------------------------------------------------------------------
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn();
  return { default: MockAnthropic };
});

// ---------------------------------------------------------------------------
// Mock: lib/sse
// ---------------------------------------------------------------------------
vi.mock('../lib/sse.js', () => ({
  openSse: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: middleware/errorHandler
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
// Mock: settings.model — settingsModel.get drives the workvault_root lookup
// for read_document. We make it controllable per-test.
// ---------------------------------------------------------------------------
const mockSettingsGet = vi.fn((key: string): string | null => {
  if (key === 'anthropic_api_key') return 'sk-ant-mock-key';
  return null;
});
vi.mock('../models/settings.model.js', () => ({
  settingsModel: {
    get: (key: string) => mockSettingsGet(key),
    getMasked: vi.fn(() => '***y'),
    set: vi.fn(),
  },
  SECRET_KEYS: new Set(['anthropic_api_key']),
  warmDpapi: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock: agentToolAudit.model — capture every audit append
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

const mockNoteCreateInsight = vi.fn();
const mockNoteListRecent = vi.fn((): unknown[] => []);
const mockNoteSearch = vi.fn((_q?: string, _orgId?: number | null): unknown[] => []);
vi.mock('../models/note.model.js', () => ({
  noteModel: {
    createInsight: mockNoteCreateInsight,
    listRecent: mockNoteListRecent,
    search: mockNoteSearch,
    create: vi.fn(),
    listFor: vi.fn(() => []),
  },
}));

const mockAgentMessageAppend = vi.fn();
const mockAgentMessageListByThread = vi.fn(() => []);
vi.mock('../models/agentMessage.model.js', () => ({
  agentMessageModel: {
    append: mockAgentMessageAppend,
    listByThread: mockAgentMessageListByThread,
    listForThread: vi.fn(() => []),
  },
}));

const mockAgentConfigGetEffective = vi.fn();
vi.mock('../models/agentConfig.model.js', () => ({
  agentConfigModel: {
    getEffective: mockAgentConfigGetEffective,
  },
}));

const mockAgentThreadTouch = vi.fn();
vi.mock('../models/agentThread.model.js', () => ({
  agentThreadModel: {
    touchLastMessage: mockAgentThreadTouch,
    create: vi.fn(),
    listFor: vi.fn(() => []),
    get: vi.fn(),
    remove: vi.fn(),
  },
}));

const mockOrgGet = vi.fn();
vi.mock('../models/organization.model.js', () => ({
  organizationModel: {
    get: mockOrgGet,
    create: vi.fn(),
    listByType: vi.fn(() => []),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const mockContactListFor = vi.fn(() => []);
const mockContactGet = vi.fn();
vi.mock('../models/contact.model.js', () => ({
  contactModel: {
    listFor: mockContactListFor,
    get: mockContactGet,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const mockProjectListFor = vi.fn(() => []);
vi.mock('../models/project.model.js', () => ({
  projectModel: {
    listFor: mockProjectListFor,
  },
}));

const mockDocumentListFor = vi.fn((_orgId?: number): unknown[] => []);
vi.mock('../models/document.model.js', () => ({
  documentModel: {
    listFor: mockDocumentListFor,
  },
}));

const mockTaskCreate = vi.fn();
vi.mock('../models/task.model.js', () => ({
  taskModel: {
    create: mockTaskCreate,
  },
}));

// ---------------------------------------------------------------------------
// Imports under test (after all vi.mock calls)
// ---------------------------------------------------------------------------
import Anthropic from '@anthropic-ai/sdk';
import { streamChat } from './claude.service.js';
import { openSse } from '../lib/sse.js';
import { db } from '../db/database.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SseCapture {
  send: Mock;
  end: Mock;
}

interface FakeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Build a fake Anthropic stream that emits a single text delta and then
 * surfaces the supplied tool_use block in finalMessage.content.
 */
function makeFakeStream(toolUse: FakeToolUseBlock | null) {
  const events: Array<Record<string, unknown>> = [
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } },
  ];
  const finalContent = toolUse ? [toolUse] : [];

  async function* gen() {
    for (const ev of events) yield ev;
  }
  const iterator = gen();
  return {
    [Symbol.asyncIterator]() {
      return iterator;
    },
    finalMessage: vi.fn().mockResolvedValue({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: finalContent,
      model: 'claude-sonnet-4-6',
      stop_reason: toolUse ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  };
}

function makeMockReqRes(): { req: Request; res: Response; sse: SseCapture } {
  const sse: SseCapture = { send: vi.fn(), end: vi.fn() };
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

function wireStream(stream: ReturnType<typeof makeFakeStream>) {
  const mockStream = vi
    .fn()
    .mockReturnValueOnce(stream)
    .mockImplementation(() => makeFakeStream(null));
  const mockInstance = { messages: { stream: mockStream } };
  (Anthropic as unknown as Mock).mockReturnValueOnce(mockInstance);
  return mockInstance;
}

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
  // Empty string falls through to DEFAULT_ENABLED_TOOLS in parseEnabledTools.
  tools_enabled: '',
  model: 'claude-sonnet-4-6',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();

  // Re-apply defaults after clearAllMocks wipes mockReturnValue state.
  mockOrgGet.mockReturnValue(BASE_ORG);
  mockAgentConfigGetEffective.mockReturnValue(DEFAULT_CONFIG);

  let msgIdSeq = 0;
  mockAgentMessageAppend.mockImplementation(
    (threadId: number, role: string, content: string) => ({
      id: ++msgIdSeq,
      thread_id: threadId,
      role,
      content: content ?? '',
      tool_calls: null,
      created_at: new Date().toISOString(),
    }),
  );
  mockAgentMessageListByThread.mockReturnValue([]);
  mockNoteListRecent.mockReturnValue([]);
  mockContactListFor.mockReturnValue([]);
  mockProjectListFor.mockReturnValue([]);
  mockDocumentListFor.mockReturnValue([]);

  mockSettingsGet.mockImplementation((key: string): string | null => {
    if (key === 'anthropic_api_key') return 'sk-ant-mock-key';
    return null;
  });
});

/** Pull all audit calls for a given tool name. */
function auditCallsFor(toolName: string): Array<Record<string, unknown>> {
  return (mockAuditAppend.mock.calls as Array<[Record<string, unknown>]>)
    .filter((c) => c[0]?.['tool_name'] === toolName)
    .map((c) => c[0]);
}

/** Pull all SSE tool_result events. */
function sseToolResults(sse: SseCapture): Array<Record<string, unknown>> {
  return (sse.send.mock.calls as Array<[Record<string, unknown>]>)
    .filter((c) => c[0]?.['type'] === 'tool_result')
    .map((c) => c[0]['payload'] as Record<string, unknown>);
}

// ===========================================================================
// search_notes
// ===========================================================================

describe('agent tool: search_notes', () => {
  it('happy path — FTS5 search returns results and logs audit row', async () => {
    // Insert a real org and note so the FTS5 query can find it.
    // We use raw SQL rather than model factories since note model is mocked.
    const orgRow = db.prepare<[string, string], { id: number }>(
      `INSERT INTO organizations (type, name) VALUES (?, ?) RETURNING id`,
    ).get('customer', 'Cisco FTS Test Org');
    const orgId = orgRow!.id;

    const noteRow = db.prepare<[number, string, string], { id: number }>(
      `INSERT INTO notes (organization_id, content, role) VALUES (?, ?, ?) RETURNING id`,
    ).get(orgId, 'meeting with cisco about the renewal next quarter', 'user');
    const noteId = noteRow!.id;

    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_search',
        name: 'search_notes',
        input: { query: 'cisco', org_id: orgId },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId, threadId: 700, content: 'find cisco notes', req, res });

    const audits = auditCallsFor('search_notes');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('ok');

    const results = sseToolResults(sse);
    expect(results.length).toBe(1);
    expect(results[0]?.['tool_use_id']).toBe('tu_search');
    expect(typeof results[0]?.['content']).toBe('string');
    const decoded = JSON.parse(results[0]['content'] as string) as {
      results: Array<{ note_id: number; org_id: number; snippet: string }>;
    };
    expect(decoded.results).toHaveLength(1);
    expect(decoded.results[0]?.note_id).toBe(noteId);
    expect(decoded.results[0]?.snippet.length).toBeLessThanOrEqual(300);
  });

  it('failure path — empty query is rejected with audit status=rejected and is_error tool_result', async () => {
    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_search_bad',
        name: 'search_notes',
        input: { query: '   ' },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 701, content: 'bad query', req, res });

    expect(mockNoteSearch).not.toHaveBeenCalled();

    const audits = auditCallsFor('search_notes');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('rejected');

    const results = sseToolResults(sse);
    expect(results[0]?.['is_error']).toBe(true);
  });
});

// ===========================================================================
// list_documents
// ===========================================================================

describe('agent tool: list_documents', () => {
  it('happy path — returns filtered documents and logs audit row', async () => {
    // documentModel.listFor is also called by buildSystemPrompt (system-prompt
    // hydration), so use mockReturnValue (sticky) — both call sites need
    // matching data so the tool-handler call sees the 2-row payload.
    mockDocumentListFor.mockReturnValue([
      {
        id: 1,
        organization_id: 1,
        kind: 'link',
        label: 'Renewal SOW',
        url_or_path: 'https://example.com/sow',
        source: 'manual',
        created_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 2,
        organization_id: 1,
        kind: 'file',
        label: 'Notes.md',
        url_or_path: 'C:/vault/notes.md',
        source: 'onedrive_scan',
        created_at: '2026-04-02T00:00:00.000Z',
      },
    ]);

    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_list',
        name: 'list_documents',
        input: { org_id: 1, kind: 'file' },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 710, content: 'list docs', req, res });

    expect(mockDocumentListFor).toHaveBeenCalledWith(1);

    const audits = auditCallsFor('list_documents');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('ok');

    const results = sseToolResults(sse);
    expect(results.length).toBe(1);
    const decoded = JSON.parse(results[0]?.['content'] as string) as {
      documents: Array<{ id: number; kind: string }>;
    };
    expect(decoded.documents).toHaveLength(1);
    expect(decoded.documents[0]?.kind).toBe('file');
  });

  it('failure path — missing org_id rejected; documentModel.listFor not called', async () => {
    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_list_bad',
        name: 'list_documents',
        input: { kind: 'all' },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 711, content: 'list docs', req, res });

    // listFor is called once by buildSystemPrompt for system-prompt
    // hydration; the rejected tool handler must not add a second call.
    expect(mockDocumentListFor).toHaveBeenCalledTimes(1);

    const audits = auditCallsFor('list_documents');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('rejected');

    const results = sseToolResults(sse);
    expect(results[0]?.['is_error']).toBe(true);
  });
});

// ===========================================================================
// read_document
// ===========================================================================

describe('agent tool: read_document', () => {
  /** Build a real tmp directory with one .md file inside. Returns
   *  { root, file } so the test can target the file by name. */
  function makeWorkvault(): { root: string; file: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-tools-test-'));
    const file = path.join(root, 'sample.md');
    fs.writeFileSync(file, '# sample\n\nhello world\n', 'utf8');
    return { root, file };
  }

  it('happy path — reads file, wraps in <untrusted_document>, audit row=ok', async () => {
    const { root, file } = makeWorkvault();
    mockSettingsGet.mockImplementation((key: string): string | null => {
      if (key === 'anthropic_api_key') return 'sk-ant-mock-key';
      if (key === 'workvault_root') return root;
      return null;
    });

    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_read',
        name: 'read_document',
        input: { path: file },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 720, content: 'read it', req, res });

    const audits = auditCallsFor('read_document');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('ok');

    const results = sseToolResults(sse);
    expect(results.length).toBe(1);
    const content = results[0]?.['content'] as string;
    expect(content).toMatch(/^<untrusted_document src=".+sample\.md">/);
    expect(content).toContain('hello world');
    expect(content).toMatch(/<\/untrusted_document>$/);
  });

  it("safe-path rejection — input containing '..' is rejected; readFileSync is never called", async () => {
    const { root } = makeWorkvault();
    mockSettingsGet.mockImplementation((key: string): string | null => {
      if (key === 'anthropic_api_key') return 'sk-ant-mock-key';
      if (key === 'workvault_root') return root;
      return null;
    });

    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_read_evil',
        name: 'read_document',
        // Path that — once resolved — escapes root.
        input: { path: '../../../etc/passwd' },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 721, content: 'read evil', req, res });

    // The audit row's `rejected_reason: safe-path-rejected` plus the
    // is_error tool_result both prove the handler bailed before any read.
    // (vi.spyOn(fs, 'readFileSync') is unreliable on Node's namespace
    // export — non-configurable property — so we trust the audit trail.)

    const audits = auditCallsFor('read_document');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('rejected');
    const reason = (audits[0]?.['output'] as Record<string, unknown>)['rejected_reason'];
    expect(typeof reason).toBe('string');
    expect((reason as string).toLowerCase()).toContain('safe-path-rejected');

    const results = sseToolResults(sse);
    expect(results[0]?.['is_error']).toBe(true);
  });

  it('failure path — root not configured rejects without filesystem access', async () => {
    mockSettingsGet.mockImplementation((key: string): string | null => {
      if (key === 'anthropic_api_key') return 'sk-ant-mock-key';
      return null; // both workvault_root and onedrive_root unset
    });

    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_read_noroot',
        name: 'read_document',
        input: { path: 'some-file.md' },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 722, content: 'read', req, res });

    const audits = auditCallsFor('read_document');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('rejected');
    expect((audits[0]?.['output'] as Record<string, unknown>)['rejected_reason']).toBe(
      'no_root_configured',
    );

    const results = sseToolResults(sse);
    expect(results[0]?.['is_error']).toBe(true);
  });
});

// ===========================================================================
// create_task
// ===========================================================================

describe('agent tool: create_task', () => {
  it('happy path — creates task and logs audit row', async () => {
    mockTaskCreate.mockReturnValueOnce({
      id: 99,
      organization_id: 1,
      contact_id: null,
      title: 'follow up on renewal',
      due_date: '2026-05-01',
      status: 'open',
      created_at: '2026-04-25T00:00:00.000Z',
      completed_at: null,
    });

    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_task',
        name: 'create_task',
        input: {
          title: 'follow up on renewal',
          due_date: '2026-05-01',
          org_id: 1,
        },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 730, content: 'remind me', req, res });

    expect(mockTaskCreate).toHaveBeenCalledTimes(1);
    expect(mockTaskCreate.mock.calls[0]?.[0]).toMatchObject({
      title: 'follow up on renewal',
      due_date: '2026-05-01',
      organization_id: 1,
      contact_id: null,
    });

    const audits = auditCallsFor('create_task');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('ok');
    expect((audits[0]?.['output'] as Record<string, unknown>)['task_id']).toBe(99);

    const results = sseToolResults(sse);
    const decoded = JSON.parse(results[0]?.['content'] as string) as { task_id: number };
    expect(decoded.task_id).toBe(99);
  });

  it('failure path — empty title is rejected; taskModel.create not called', async () => {
    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_task_bad',
        name: 'create_task',
        input: { title: '   ' },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 731, content: 'remind me', req, res });

    expect(mockTaskCreate).not.toHaveBeenCalled();

    const audits = auditCallsFor('create_task');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('rejected');

    const results = sseToolResults(sse);
    expect(results[0]?.['is_error']).toBe(true);
  });

  it('cross-org guard — contact_id from a different org rejected at SERVICE LAYER (taskModel.create not called)', async () => {
    // Contact 5 belongs to org 2, but the tool tries to attach to org 1.
    // The DB trigger from migration 003 would also catch this, but we want
    // the service layer to reject first so the model.create call is never
    // issued — that's what this test asserts.
    mockContactGet.mockReturnValueOnce({
      id: 5,
      organization_id: 2, // different from the org_id the tool is using
      name: 'Wrong Contact',
      title: null,
      email: null,
      phone: null,
      role: null,
      created_at: '2026-04-01T00:00:00.000Z',
    });

    wireStream(
      makeFakeStream({
        type: 'tool_use',
        id: 'tu_task_xorg',
        name: 'create_task',
        input: {
          title: 'follow up',
          org_id: 1,
          contact_id: 5,
        },
      }),
    );
    const { req, res, sse } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 732, content: 'remind me', req, res });

    // Service-layer guard fires before DB.
    expect(mockContactGet).toHaveBeenCalledWith(5);
    expect(mockTaskCreate).not.toHaveBeenCalled();

    const audits = auditCallsFor('create_task');
    expect(audits.length).toBe(1);
    expect(audits[0]?.['status']).toBe('rejected');
    expect((audits[0]?.['output'] as Record<string, unknown>)['rejected_reason']).toBe(
      'contact_org_mismatch',
    );

    const results = sseToolResults(sse);
    expect(results[0]?.['is_error']).toBe(true);
    expect((results[0]?.['content'] as string).toLowerCase()).toContain('mismatch');
  });
});
