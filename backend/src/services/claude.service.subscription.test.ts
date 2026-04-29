import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database.js';

const sdkMocks = vi.hoisted(() => ({
  query: vi.fn(),
  createSdkMcpServer: vi.fn(),
  tool: vi.fn(),
}));

const settingsMocks = vi.hoisted(() => ({
  get: vi.fn(),
  getMasked: vi.fn(),
  set: vi.fn(),
}));

const subagentMocks = vi.hoisted(() => ({
  ensureBashEnvForClaudeCode: vi.fn(),
  hasClaudeCodeCredentials: vi.fn(),
  resolveClaudeExecutable: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY: '<dynamic-boundary>',
  createSdkMcpServer: sdkMocks.createSdkMcpServer,
  query: sdkMocks.query,
  tool: sdkMocks.tool,
}));

vi.mock('../models/settings.model.js', () => ({
  settingsModel: {
    get: settingsMocks.get,
    getMasked: settingsMocks.getMasked,
    set: settingsMocks.set,
  },
  SECRET_KEYS: new Set(['anthropic_api_key']),
  warmDpapi: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./subagentSdk.service.js', () => ({
  AUTH_ACTION_MESSAGE: 'Run claude /login',
  ensureBashEnvForClaudeCode: subagentMocks.ensureBashEnvForClaudeCode,
  hasClaudeCodeCredentials: subagentMocks.hasClaudeCodeCredentials,
  resolveClaudeExecutable: subagentMocks.resolveClaudeExecutable,
}));

import {
  extractNoteProposals,
  extractOrgMentions,
  extractPrimaryOrgAndMentions,
} from './claude.service.js';

interface QueryParams {
  options?: {
    maxTurns?: number;
    outputFormat?: {
      type?: string;
      schema?: unknown;
    };
  };
}

const structuredOutputs: unknown[] = [];

function makeResultEvent(structuredOutput: unknown): Record<string, unknown> {
  return {
    type: 'result',
    subtype: 'success',
    duration_ms: 10,
    duration_api_ms: 8,
    is_error: false,
    num_turns: 2,
    result: '',
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: 'test-uuid',
    session_id: 'test-session',
    structured_output: structuredOutput,
  };
}

beforeEach(() => {
  db.exec('DELETE FROM anthropic_usage_events');
  structuredOutputs.length = 0;

  sdkMocks.query.mockReset();
  sdkMocks.query.mockImplementation((_params: unknown) => {
    async function* gen() {
      yield makeResultEvent(structuredOutputs.shift() ?? {});
    }
    return gen();
  });

  settingsMocks.get.mockReset();
  settingsMocks.get.mockImplementation((key: string) => {
    if (key === 'claude_auth_mode') return 'subscription';
    if (key === 'default_model') return 'claude-sonnet-4-6';
    return null;
  });

  subagentMocks.ensureBashEnvForClaudeCode.mockReset();
  subagentMocks.hasClaudeCodeCredentials.mockReset();
  subagentMocks.hasClaudeCodeCredentials.mockReturnValue(true);
  subagentMocks.resolveClaudeExecutable.mockReset();
  subagentMocks.resolveClaudeExecutable.mockReturnValue(undefined);
});

describe('Claude Code subscription structured extraction', () => {
  it('gives structured output extractors enough turns for schema enforcement', async () => {
    structuredOutputs.push(
      { mentions: [{ name: 'C.H. Robinson', confidence: 0.92 }] },
      {
        primary_org_name: 'C.H. Robinson',
        primary_confidence: 0.95,
        mentions: [{ name: 'WWT', confidence: 0.7 }],
      },
      {
        proposals: [
          {
            type: 'task_follow_up',
            title: 'Schedule pricing review',
            summary: 'Schedule a pricing review with Maya and the customer.',
            evidence_quote: 'Next step: schedule a pricing review with Maya by 2026-05-01.',
            confidence: 0.93,
            payload: { task_title: 'Schedule pricing review', due_date: '2026-05-01' },
          },
        ],
      },
    );

    await expect(
      extractOrgMentions('Met with C.H. Robinson about refresh planning.', ['C.H. Robinson']),
    ).resolves.toHaveLength(1);

    await expect(
      extractPrimaryOrgAndMentions('C.H. Robinson asked WWT for next steps.', [
        'C.H. Robinson',
        'WWT',
      ]),
    ).resolves.toMatchObject({ primary_org_name: 'C.H. Robinson' });

    await expect(
      extractNoteProposals({
        noteContent:
          'From: Maya Patel, WWT Security Architect\n' +
          'Next step: schedule a pricing review with Maya by 2026-05-01.',
        orgName: 'C.H. Robinson',
        orgType: 'customer',
        projectName: 'Edge Refresh',
      }),
    ).resolves.toHaveLength(1);

    const calls = sdkMocks.query.mock.calls.map(([params]) => params as QueryParams);
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.options?.outputFormat?.type).toBe('json_schema');
      expect(call.options?.maxTurns).toBe(3);
    }
  });
});
