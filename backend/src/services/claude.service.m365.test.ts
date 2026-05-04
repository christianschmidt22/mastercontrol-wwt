/**
 * claude.service.m365.test.ts
 *
 * Tests verifying M365 MCP integration behaviour in claude.service.ts:
 *   - When M365 is enabled: mcp_servers is included in the API call payload
 *   - When M365 is enabled: record_insight is filtered out of the tools array
 *   - When M365 is enabled: the beta header is added
 *   - When M365 is enabled: the stable system prompt contains pagination guidance
 *   - When M365 is disabled: the payload is unchanged from baseline behavior
 *
 * The Anthropic SDK is fully mocked. We inspect what the mock was called with
 * to verify the payload content.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// vi.hoisted: variables used inside vi.mock factories must be hoisted so they
// are initialized before the factories run (which happens before imports).
// ---------------------------------------------------------------------------
const {
  mockSettingsGet,
  mockAuditAppend,
  mockAgentMessageAppend,
  mockAgentConfigGetEffective,
  mockAgentThreadTouch,
  mockOrgGet,
  mockClaudeCodeQuery,
  mockCreateSdkMcpServer,
  mockSdkTool,
  mockHasClaudeCodeCredentials,
} = vi.hoisted(() => ({
  mockSettingsGet: vi.fn(),
  mockAuditAppend: vi.fn(),
  mockAgentMessageAppend: vi.fn(),
  mockAgentConfigGetEffective: vi.fn(),
  mockAgentThreadTouch: vi.fn(),
  mockOrgGet: vi.fn(),
  mockClaudeCodeQuery: vi.fn(),
  mockCreateSdkMcpServer: vi.fn(),
  mockSdkTool: vi.fn(),
  mockHasClaudeCodeCredentials: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @anthropic-ai/sdk — must appear before any service import
// ---------------------------------------------------------------------------
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn();
  return { default: MockAnthropic };
});

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY: '<dynamic-boundary>',
  createSdkMcpServer: mockCreateSdkMcpServer,
  query: mockClaudeCodeQuery,
  tool: mockSdkTool,
}));

// ---------------------------------------------------------------------------
// Mock: lib/sse.ts
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
// Mock: settings.model.ts — we control values per test
// ---------------------------------------------------------------------------
vi.mock('../models/settings.model.js', () => ({
  settingsModel: {
    get: mockSettingsGet,
    getMasked: vi.fn(() => '***y'),
    set: vi.fn(),
  },
  SECRET_KEYS: new Set(['anthropic_api_key', 'm365_mcp_token', 'personal_anthropic_api_key', 'calendar_ics_url']),
  warmDpapi: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock: agentToolAudit.model.ts
// ---------------------------------------------------------------------------
vi.mock('../models/agentToolAudit.model.js', () => ({
  agentToolAuditModel: {
    append: (input: unknown) => mockAuditAppend(input),
    listByThread: vi.fn(() => []),
  },
}));

// ---------------------------------------------------------------------------
// Mock: lazily-imported model modules
// ---------------------------------------------------------------------------

vi.mock('../models/note.model.js', () => ({
  noteModel: {
    createInsight: vi.fn(),
    listRecent: vi.fn(() => []),
    create: vi.fn(),
    listFor: vi.fn(() => []),
    search: vi.fn(() => []),
  },
}));

vi.mock('../models/agentMessage.model.js', () => ({
  agentMessageModel: {
    append: mockAgentMessageAppend,
    listByThread: vi.fn(() => []),
    listForThread: vi.fn(() => []),
  },
}));

vi.mock('../models/agentConfig.model.js', () => ({
  agentConfigModel: {
    getEffective: mockAgentConfigGetEffective,
  },
}));

vi.mock('../models/agentThread.model.js', () => ({
  agentThreadModel: {
    touchLastMessage: mockAgentThreadTouch,
    create: vi.fn(),
    listFor: vi.fn(() => []),
    get: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../models/organization.model.js', () => ({
  organizationModel: {
    get: mockOrgGet,
    create: vi.fn(),
    listByType: vi.fn(() => []),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../models/contact.model.js', () => ({
  contactModel: {
    listFor: vi.fn(() => []),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
  },
}));
vi.mock('../models/project.model.js', () => ({
  projectModel: { listFor: vi.fn(() => []) },
}));
vi.mock('../models/document.model.js', () => ({
  documentModel: { listFor: vi.fn(() => []) },
}));
vi.mock('../models/task.model.js', () => ({
  taskModel: { create: vi.fn(() => ({ id: 1 })) },
}));
vi.mock('../models/anthropicUsage.model.js', () => ({
  anthropicUsageModel: { record: vi.fn() },
}));
vi.mock('../lib/anthropicPricing.js', () => ({
  computeCostMicros: vi.fn(() => 0),
}));
vi.mock('../lib/safePath.js', () => ({
  resolveSafePath: vi.fn(),
  enforceSizeLimit: vi.fn(),
}));
vi.mock('./subagentSdk.service.js', () => ({
  AUTH_ACTION_MESSAGE: 'Please run claude /login',
  ensureBashEnvForClaudeCode: vi.fn(),
  hasClaudeCodeCredentials: mockHasClaudeCodeCredentials,
  resolveClaudeExecutable: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// Import service after mocks
// ---------------------------------------------------------------------------
import Anthropic from '@anthropic-ai/sdk';
import { streamChat } from './claude.service.js';
import { openSse } from '../lib/sse.js';

// ---------------------------------------------------------------------------
// Fixtures
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
  // Include record_insight in enabled tools so we can test suppression
  tools_enabled: '["web_search","record_insight","search_notes","create_task"]',
  model: 'claude-sonnet-4-6',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeStream(events: Array<Record<string, unknown>> = []) {
  const defaultFinal: Anthropic.Message = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    // Cast content to bypass TextBlock.citations typing quirk in SDK ^0.39
    content: [] as Anthropic.Message['content'],
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 } as Anthropic.Message['usage'],
  };

  async function* gen() {
    for (const ev of events) yield ev;
  }

  const iterator = gen();
  return {
    [Symbol.asyncIterator]() { return iterator; },
    finalMessage: vi.fn().mockResolvedValue(defaultFinal),
  };
}

function makeMockReqRes() {
  const sse = { send: vi.fn(), end: vi.fn() };
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

/** Wire Anthropic mock and capture the stream mock so we can inspect calls. */
function wireStream(stream: ReturnType<typeof makeFakeStream>) {
  const mockStreamFn = vi
    .fn()
    .mockReturnValueOnce(stream)
    // Any additional turns return an empty stream.
    .mockImplementation(() => makeFakeStream());
  const mockInstance = { messages: { stream: mockStreamFn } };
  (Anthropic as unknown as Mock).mockReturnValueOnce(mockInstance);
  return { mockStreamFn, mockInstance };
}

// ---------------------------------------------------------------------------
// Type-safe call-arg extraction helpers
// ---------------------------------------------------------------------------

/** Extract the first positional arg of the first call to a mock as a typed object. */
function firstCallArg<T>(mockFn: Mock): T {
  // mock.calls[n][m] is any in vitest; the generic parameter narrows the usage.
  return mockFn.mock.calls[0][0];
}

function firstCallOption<T>(mockFn: Mock): T | undefined {
  return mockFn.mock.calls[0]?.[1];
}

// ---------------------------------------------------------------------------
// Default settings getter — all M365 disabled
// ---------------------------------------------------------------------------

function buildSettingsGetter(
  m365Enabled: boolean,
  m365Configured: boolean,
  authMode: 'api_key' | 'subscription' = 'api_key',
) {
  return (key: string): string | null => {
    if (key === 'anthropic_api_key') return 'sk-ant-test';
    if (key === 'claude_auth_mode') return authMode;
    if (key === 'm365_mcp_enabled') return m365Enabled ? '1' : '0';
    if (key === 'm365_mcp_url') return m365Configured ? 'https://mcp.anthropic.com/m365/abc' : '';
    if (key === 'm365_mcp_token') return m365Configured ? 'tok_test_secret' : '';
    if (key === 'm365_mcp_name') return 'm365';
    return null;
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockHasClaudeCodeCredentials.mockReturnValue(false);
  mockCreateSdkMcpServer.mockImplementation((input: { name: string; tools?: Array<{ name: string }> }) => ({
    type: 'sdk',
    name: input.name,
    tools: input.tools ?? [],
  }));
  mockSdkTool.mockImplementation((name: string) => ({ name }));
  mockOrgGet.mockReturnValue(BASE_ORG);
  mockAgentConfigGetEffective.mockReturnValue(DEFAULT_CONFIG);

  let idSeq = 0;
  mockAgentMessageAppend.mockImplementation((threadId: number, role: string, content: string) => ({
    id: ++idSeq,
    thread_id: threadId,
    role,
    content: content ?? '',
    tool_calls: null,
    created_at: new Date().toISOString(),
  }));
});

// ---------------------------------------------------------------------------
// When M365 disabled — baseline behavior unchanged
// ---------------------------------------------------------------------------

describe('M365 MCP — disabled (baseline)', () => {
  it('does not include mcp_servers in the stream call when M365 is disabled', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(false, false));

    const stream = makeFakeStream();
    const { mockStreamFn } = wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 1, content: 'hello', req, res });

    expect(mockStreamFn).toHaveBeenCalled();
    const callArg = firstCallArg<Record<string, unknown>>(mockStreamFn);
    expect(callArg).not.toHaveProperty('mcp_servers');
  });

  it('does not add the beta header when M365 is disabled', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(false, false));

    const stream = makeFakeStream();
    const { mockStreamFn } = wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 2, content: 'hello', req, res });

    expect(mockStreamFn).toHaveBeenCalled();
    const callOptions = firstCallOption<Record<string, unknown>>(mockStreamFn);
    const headers = callOptions?.['headers'];
    expect((headers as Record<string, unknown> | undefined)?.['anthropic-beta']).toBeUndefined();
  });

  it('includes record_insight in tools when M365 is disabled', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(false, false));

    const stream = makeFakeStream();
    const { mockStreamFn } = wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 3, content: 'hello', req, res });

    expect(mockStreamFn).toHaveBeenCalled();
    const callArg = firstCallArg<{ tools?: Array<{ name?: string }> }>(mockStreamFn);
    const toolNames = (callArg.tools ?? []).map((t) => t.name ?? '');
    expect(toolNames).toContain('record_insight');
  });
});

describe('M365 MCP - Claude Code subscription path', () => {
  it('uses Claude Code managed M365 tools without URL/token config', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(true, false, 'subscription'));
    mockHasClaudeCodeCredentials.mockReturnValue(true);
    async function* sdkEvents() {
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 8,
        is_error: false,
        num_turns: 1,
        result: 'ok',
        errors: [],
        total_cost_usd: 0,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      };
    }
    mockClaudeCodeQuery.mockReturnValue(sdkEvents());
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 20, content: 'show emails', req, res });

    expect(mockClaudeCodeQuery).toHaveBeenCalled();
    const callArg = firstCallArg<{
      options?: { allowedTools?: string[]; maxTurns?: number; systemPrompt?: string[] };
    }>(mockClaudeCodeQuery);
    expect(callArg.options?.maxTurns).toBe(16);
    expect(callArg.options?.allowedTools).toContain(
      'mcp__claude_ai_Microsoft_365__outlook_email_search',
    );
    expect(callArg.options?.allowedTools).not.toContain('mcp__mastercontrol__record_insight');
    expect(callArg.options?.systemPrompt?.join('\n')).toContain('Microsoft 365 Search Tools');
  });

  it('gives calendar/search requests enough turns for multiple M365 tool calls', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(true, false, 'subscription'));
    mockHasClaudeCodeCredentials.mockReturnValue(true);
    async function* sdkEvents() {
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 8,
        is_error: false,
        num_turns: 8,
        result: 'availability found',
        errors: [],
        total_cost_usd: 0,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      };
    }
    mockClaudeCodeQuery.mockReturnValue(sdkEvents());
    const { req, res } = makeMockReqRes();

    await streamChat({
      orgId: 1,
      threadId: 21,
      content: 'Check my and Josh Garrett calendars for availability over the next two weeks',
      req,
      res,
    });

    const callArg = firstCallArg<{ options?: { maxTurns?: number } }>(mockClaudeCodeQuery);
    expect(callArg.options?.maxTurns).toBeGreaterThan(8);
  });
});

// ---------------------------------------------------------------------------
// When M365 enabled — MCP injected, record_insight suppressed
// ---------------------------------------------------------------------------

describe('M365 MCP — enabled', () => {
  it('includes mcp_servers in the stream call', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(true, true));

    const stream = makeFakeStream();
    const { mockStreamFn } = wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 10, content: 'show emails', req, res });

    expect(mockStreamFn).toHaveBeenCalled();
    const callArg = firstCallArg<Record<string, unknown>>(mockStreamFn);
    expect(callArg).toHaveProperty('mcp_servers');
    const mcpServers = callArg['mcp_servers'] as Array<Record<string, unknown>>;
    expect(mcpServers).toHaveLength(1);
    const server = mcpServers[0] ?? {};
    expect(server['type']).toBe('url');
    expect(server['url']).toBe('https://mcp.anthropic.com/m365/abc');
    expect(server['authorization_token']).toBe('tok_test_secret');
  });

  it('adds the anthropic-beta header when M365 is enabled', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(true, true));

    const stream = makeFakeStream();
    const { mockStreamFn } = wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 11, content: 'show emails', req, res });

    expect(mockStreamFn).toHaveBeenCalled();
    const callOptions = firstCallOption<Record<string, unknown>>(mockStreamFn);
    const headers = callOptions?.['headers'];
    expect((headers as Record<string, unknown> | undefined)?.['anthropic-beta']).toBe('mcp-client-2025-04-04');
  });

  it('filters out record_insight from the tools array (R-021)', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(true, true));

    const stream = makeFakeStream();
    const { mockStreamFn } = wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 12, content: 'show emails', req, res });

    expect(mockStreamFn).toHaveBeenCalled();
    const callArg = firstCallArg<{ tools?: Array<{ name?: string }> }>(mockStreamFn);
    const toolNames = (callArg.tools ?? []).map((t) => t.name ?? '');
    expect(toolNames).not.toContain('record_insight');
  });

  it('keeps web_search in tools even when M365 is enabled', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(true, true));

    const stream = makeFakeStream();
    const { mockStreamFn } = wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 13, content: 'show emails', req, res });

    expect(mockStreamFn).toHaveBeenCalled();
    const callArg = firstCallArg<{ tools?: Array<{ name?: string }> }>(mockStreamFn);
    const toolNames = (callArg.tools ?? []).map((t) => t.name ?? '');
    expect(toolNames).toContain('web_search');
  });

  it('includes M365 pagination guidance in the stable system prompt block', async () => {
    mockSettingsGet.mockImplementation(buildSettingsGetter(true, true));

    const stream = makeFakeStream();
    const { mockStreamFn } = wireStream(stream);
    const { req, res } = makeMockReqRes();

    await streamChat({ orgId: 1, threadId: 14, content: 'show emails', req, res });

    expect(mockStreamFn).toHaveBeenCalled();
    const callArg = firstCallArg<{
      system?: Array<{ text?: string; cache_control?: { type: string } }>;
    }>(mockStreamFn);
    const systemBlocks = callArg.system ?? [];
    // First block is the stable (cached) block.
    const stableBlock = systemBlocks.find((b) => b.cache_control?.type === 'ephemeral');
    expect(stableBlock).toBeDefined();
    const stableText = stableBlock?.text ?? '';
    // Pagination guidance must be present.
    expect(stableText).toContain('MUST');
    expect(stableText).toContain('offset');
    expect(stableText).toContain('50');
  });
});
