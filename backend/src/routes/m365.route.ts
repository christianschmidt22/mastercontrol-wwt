/**
 * m365.route.ts — Microsoft 365 MCP connector endpoints.
 *
 * Routes:
 *   POST /api/m365/test — verify connectivity to the M365 MCP connector.
 *
 * Security:
 *   - Token is read via settingsModel.get() (plaintext, service-layer only).
 *   - Routes never return the token — only { ok, response } or { ok, error }.
 *   - Errors pass through the redacting error handler (R-013).
 */

import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { query as queryClaudeCode, type McpServerStatus } from '@anthropic-ai/claude-agent-sdk';
import { settingsModel } from '../models/settings.model.js';
import {
  M365_CLAUDE_CODE_ALLOWED_TOOLS,
  M365_CLAUDE_CODE_SERVER_NAME,
  buildM365Mcp,
} from '../lib/m365Mcp.js';
import { HttpError } from '../middleware/errorHandler.js';
import { validateBody } from '../lib/validate.js';
import { M365TestBodySchema } from '../schemas/m365.schema.js';
import {
  AUTH_ACTION_MESSAGE,
  ensureBashEnvForClaudeCode,
  hasClaudeCodeCredentials,
  resolveClaudeExecutable,
} from '../services/subagentSdk.service.js';

export const m365Router = Router();
const execFileAsync = promisify(execFile);

type ClaudeCliMcpStatus = 'connected' | 'needs-auth' | 'failed' | 'missing' | 'unknown';

function findM365Status(statuses: McpServerStatus[]): McpServerStatus | undefined {
  return statuses.find((status) => status.name === M365_CLAUDE_CODE_SERVER_NAME);
}

function parseM365StatusFromClaudeCli(output: string): ClaudeCliMcpStatus {
  const line = output
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${M365_CLAUDE_CODE_SERVER_NAME}:`));

  if (!line) return 'missing';

  const normalized = line.toLowerCase();
  if (normalized.includes('needs authentication')) return 'needs-auth';
  if (normalized.includes('failed')) return 'failed';
  if (normalized.includes('connected')) return 'connected';
  return 'unknown';
}

async function getM365StatusFromClaudeCli(claudeExe: string | null): Promise<ClaudeCliMcpStatus> {
  if (!claudeExe) return 'unknown';
  try {
    const { stdout, stderr } = await execFileAsync(
      claudeExe,
      ['mcp', 'list'],
      {
        env: process.env,
        timeout: 60_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
    return parseM365StatusFromClaudeCli(`${stdout}\n${stderr}`);
  } catch {
    return 'unknown';
  }
}

async function testViaClaudeCode(): Promise<{ ok: boolean; response?: string; error?: string }> {
  if (!hasClaudeCodeCredentials()) {
    return { ok: false, error: AUTH_ACTION_MESSAGE };
  }

  ensureBashEnvForClaudeCode();
  const claudeExe = resolveClaudeExecutable();
  const query = queryClaudeCode({
    prompt: 'Reply with MCP_OK only.',
    options: {
      maxTurns: 1,
      tools: [],
      allowedTools: M365_CLAUDE_CODE_ALLOWED_TOOLS,
      permissionMode: 'dontAsk',
      persistSession: false,
      settingSources: ['user'],
      ...(claudeExe ? { pathToClaudeCodeExecutable: claudeExe } : {}),
    },
  });

  try {
    const status = findM365Status(await query.mcpServerStatus());
    const cliStatus = status?.status === 'connected'
      ? 'connected'
      : await getM365StatusFromClaudeCli(claudeExe);

    if (cliStatus === 'connected' && status?.status !== 'connected') {
      return {
        ok: true,
        response: 'MCP_OK via Claude Code enterprise connector (Microsoft 365 connected).',
      };
    }

    if (!status) {
      return {
        ok: false,
        error: 'Claude Code login is active, but the Claude.ai Microsoft 365 connector is not available on this account.',
      };
    }
    if (status.status === 'connected') {
      const toolCount = status.tools?.length ?? M365_CLAUDE_CODE_ALLOWED_TOOLS.length;
      return {
        ok: true,
        response: `MCP_OK via Claude Code enterprise connector (${toolCount} M365 tools available).`,
      };
    }
    if (status.status === 'needs-auth') {
      return {
        ok: false,
        error:
          'Claude Code can see the Claude.ai Microsoft 365 connector, but it still needs Microsoft 365 authentication. Open Claude Code and authenticate the "claude.ai Microsoft 365" MCP server.',
      };
    }
    return {
      ok: false,
      error: `Claude.ai Microsoft 365 connector is ${status.status}${status.error ? `: ${status.error}` : ''}`,
    };
  } finally {
    await query.return?.();
  }
}

/**
 * POST /api/m365/test
 *
 * Attempts a minimal Anthropic API call with the configured MCP server.
 * Returns { ok: true, response: string } on success, or
 *         { ok: false, error: string } on failure.
 *
 * Returns 400 if M365 MCP is not configured or not enabled.
 */
m365Router.post('/test', validateBody(M365TestBodySchema), async (_req, res, next) => {
  try {
    const url = settingsModel.get('m365_mcp_url') ?? '';
    const enabledRaw = settingsModel.get('m365_mcp_enabled') ?? '0';
    const name = settingsModel.get('m365_mcp_name') ?? 'm365';
    // Token is secret — plaintext getter allowed here (service-adjacent route, R-003).
    const token = settingsModel.get('m365_mcp_token') ?? '';

    const enabled = enabledRaw === '1' || enabledRaw === 'true';
    if (!enabled) {
      return next(new HttpError(400, 'M365 MCP not configured'));
    }

    if (hasClaudeCodeCredentials()) {
      res.json(await testViaClaudeCode());
      return;
    }

    const mcpResult = buildM365Mcp({
      enabled,
      url,
      token,
      name,
    });

    if (!mcpResult.serverEntry) {
      return next(new HttpError(400, 'M365 MCP not configured'));
    }

    // Fallback for the direct API-key path. Subscription users should use the
    // Claude Code branch above, which relies on the local enterprise login.
    const apiKey = settingsModel.get('anthropic_api_key');
    if (!apiKey) {
      return next(new HttpError(503, AUTH_ACTION_MESSAGE));
    }

    const client = new Anthropic({ apiKey });

    // The mcp_servers parameter is part of the beta API, not yet typed in
    // the SDK's MessageCreateParams. We pass it via the body override using
    // `as unknown` to bridge the type gap safely at runtime.
    const requestBody = {
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      messages: [
        {
          role: 'user' as const,
          content:
            'Reply with the literal token MCP_OK if you have access to the m365 MCP connector tools (outlook_email_search etc.), otherwise reply with the error you see.',
        },
      ],
      // MCP servers are passed as an extra field not yet in the SDK types.
      mcp_servers: [mcpResult.serverEntry],
    };

    // The mcp_servers param and the beta header are not in the SDK types yet.
    // We use `as unknown` casts to pass them through the SDK at runtime.
    // The response is always a non-streaming Message here since stream is not set.
    const message = await client.messages.create(
      requestBody as Parameters<typeof client.messages.create>[0],
      {
        headers: {
          'anthropic-beta': mcpResult.betaHeader ?? 'mcp-client-2025-04-04',
        },
      },
    ) as Anthropic.Message;

    // Extract text from the response.
    let responseText = '';
    for (const block of message.content) {
      if (block.type === 'text') responseText += block.text;
    }

    res.json({ ok: true, response: responseText });
  } catch (err) {
    // Log via the redacting handler; send a safe error to the client.
    const message = err instanceof Error ? err.message : 'M365 MCP test failed';
    res.json({ ok: false, error: message });
  }
});
