/**
 * m365.route.test.ts
 *
 * Tests for POST /api/m365/test.
 * The Anthropic SDK client is mocked so no real API calls are made.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk BEFORE it's imported by the route.
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();
const mockQuery = vi.fn();
const mockHasClaudeCredentials = vi.fn();
const mockResolveClaudeExecutable = vi.fn();
const mockExecFile = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

// Also mock settingsModel to control what settings values are returned.
// We need to define this BEFORE importing anything that loads settings.model.

const mockGet = vi.fn();
vi.mock('../models/settings.model.js', () => ({
  settingsModel: {
    get: mockGet,
    getMasked: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    remove: vi.fn(),
  },
  SECRET_KEYS: new Set(['anthropic_api_key', 'm365_mcp_token', 'personal_anthropic_api_key', 'calendar_ics_url']),
  warmDpapi: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/subagentSdk.service.js', () => ({
  AUTH_ACTION_MESSAGE: 'Claude.ai subscription not authenticated. Run `claude /login` first.',
  ensureBashEnvForClaudeCode: vi.fn(),
  hasClaudeCodeCredentials: mockHasClaudeCredentials,
  resolveClaudeExecutable: mockResolveClaudeExecutable,
}));

let app: Express;
beforeAll(async () => {
  // Build a minimal test app after mocks are established.
  const express = (await import('express')).default;
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const { m365Router } = await import('../routes/m365.route.js');

  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/m365', m365Router);
  testApp.use(errorHandler);
  app = testApp;
});

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  mockHasClaudeCredentials.mockReturnValue(false);
  mockResolveClaudeExecutable.mockReturnValue(null);
  mockExecFile.mockImplementation((_file, _args, _options, cb) => {
    cb(null, { stdout: '', stderr: '' });
  });
});

// ---------------------------------------------------------------------------
// Not configured
// ---------------------------------------------------------------------------

describe('POST /api/m365/test — not configured', () => {
  it('returns 400 when M365 MCP is disabled', async () => {
    // All settings return empty / disabled defaults.
    mockGet.mockImplementation((key: string) => {
      if (key === 'm365_mcp_enabled') return '0';
      if (key === 'm365_mcp_url') return '';
      if (key === 'm365_mcp_token') return '';
      if (key === 'm365_mcp_name') return 'm365';
      return null;
    });

    const res = await request(app).post('/api/m365/test').send({});
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/not configured/i);
  });

  it('returns 400 when URL is blank even if enabled', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'm365_mcp_enabled') return '1';
      if (key === 'm365_mcp_url') return '';
      if (key === 'm365_mcp_token') return 'tok_test';
      if (key === 'm365_mcp_name') return 'm365';
      return null;
    });

    const res = await request(app).post('/api/m365/test').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when token is blank even if enabled', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'm365_mcp_enabled') return '1';
      if (key === 'm365_mcp_url') return 'https://mcp.anthropic.com/m365/abc';
      if (key === 'm365_mcp_token') return '';
      if (key === 'm365_mcp_name') return 'm365';
      return null;
    });

    const res = await request(app).post('/api/m365/test').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/m365/test - Claude Code enterprise connector', () => {
  it('does not require an Anthropic API key when Claude Code can see connected M365', async () => {
    mockHasClaudeCredentials.mockReturnValue(true);
    mockGet.mockImplementation((key: string) => {
      if (key === 'm365_mcp_enabled') return '1';
      if (key === 'm365_mcp_url') return '';
      if (key === 'm365_mcp_token') return '';
      if (key === 'm365_mcp_name') return 'm365';
      if (key === 'anthropic_api_key') return null;
      return null;
    });
    const mockReturn = vi.fn().mockResolvedValue(undefined);
    mockQuery.mockReturnValue({
      mcpServerStatus: vi.fn().mockResolvedValue([
        {
          name: 'claude.ai Microsoft 365',
          status: 'connected',
          scope: 'claudeai',
          tools: [{ name: 'outlook_email_search' }],
        },
      ]),
      return: mockReturn,
    });

    const res = await request(app).post('/api/m365/test').send({});

    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean; response: string }).ok).toBe(true);
    expect((res.body as { ok: boolean; response: string }).response).toMatch(/MCP_OK via Claude Code/i);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockReturn).toHaveBeenCalled();
  });

  it('surfaces needs-auth from the Claude.ai M365 connector', async () => {
    mockHasClaudeCredentials.mockReturnValue(true);
    mockGet.mockImplementation((key: string) => {
      if (key === 'm365_mcp_enabled') return '1';
      return null;
    });
    mockQuery.mockReturnValue({
      mcpServerStatus: vi.fn().mockResolvedValue([
        {
          name: 'claude.ai Microsoft 365',
          status: 'needs-auth',
          scope: 'claudeai',
        },
      ]),
      return: vi.fn().mockResolvedValue(undefined),
    });

    const res = await request(app).post('/api/m365/test').send({});

    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean; error: string }).ok).toBe(false);
    expect((res.body as { ok: boolean; error: string }).error).toMatch(/needs Microsoft 365 authentication/i);
  });

  it('accepts connected CLI status when SDK MCP status is stale', async () => {
    mockHasClaudeCredentials.mockReturnValue(true);
    mockResolveClaudeExecutable.mockReturnValue('C:\\Claude\\claude.exe');
    mockGet.mockImplementation((key: string) => {
      if (key === 'm365_mcp_enabled') return '1';
      return null;
    });
    mockQuery.mockReturnValue({
      mcpServerStatus: vi.fn().mockResolvedValue([
        {
          name: 'claude.ai Microsoft 365',
          status: 'needs-auth',
          scope: 'claudeai',
        },
      ]),
      return: vi.fn().mockResolvedValue(undefined),
    });
    mockExecFile.mockImplementation((_file, _args, _options, cb) => {
      cb(null, {
        stdout: 'claude.ai Microsoft 365: https://microsoft365.mcp.claude.com/mcp - ✓ Connected\n',
        stderr: '',
      });
    });

    const res = await request(app).post('/api/m365/test').send({});

    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean; response: string }).ok).toBe(true);
    expect((res.body as { ok: boolean; response: string }).response).toMatch(/MCP_OK via Claude Code/i);
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('POST /api/m365/test — happy path', () => {
  it('returns { ok: true, response } when the Anthropic call succeeds', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'm365_mcp_enabled') return '1';
      if (key === 'm365_mcp_url') return 'https://mcp.anthropic.com/m365/abc';
      if (key === 'm365_mcp_token') return 'tok_test_secret';
      if (key === 'm365_mcp_name') return 'm365';
      if (key === 'anthropic_api_key') return 'sk-ant-test';
      return null;
    });

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'MCP_OK' }],
      id: 'msg_test',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const res = await request(app).post('/api/m365/test').send({});
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean; response: string }).ok).toBe(true);
    expect((res.body as { ok: boolean; response: string }).response).toBe('MCP_OK');
  });

  it('returns { ok: false, error } when the Anthropic call fails', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'm365_mcp_enabled') return '1';
      if (key === 'm365_mcp_url') return 'https://mcp.anthropic.com/m365/abc';
      if (key === 'm365_mcp_token') return 'tok_test_secret';
      if (key === 'm365_mcp_name') return 'm365';
      if (key === 'anthropic_api_key') return 'sk-ant-test';
      return null;
    });

    mockCreate.mockRejectedValue(new Error('Authentication failed'));

    const res = await request(app).post('/api/m365/test').send({});
    expect(res.status).toBe(200); // route returns 200 with ok:false
    expect((res.body as { ok: boolean; error: string }).ok).toBe(false);
    expect((res.body as { ok: boolean; error: string }).error).toMatch(/Authentication/i);
  });
});
