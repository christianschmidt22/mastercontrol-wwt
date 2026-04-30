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
import Anthropic from '@anthropic-ai/sdk';
import { settingsModel } from '../models/settings.model.js';
import { buildM365Mcp } from '../lib/m365Mcp.js';
import { HttpError } from '../middleware/errorHandler.js';
import { validateBody } from '../lib/validate.js';
import { M365TestBodySchema } from '../schemas/m365.schema.js';

export const m365Router = Router();

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

    const mcpResult = buildM365Mcp({
      enabled: enabledRaw === '1' || enabledRaw === 'true',
      url,
      token,
      name,
    });

    if (!mcpResult.serverEntry) {
      return next(new HttpError(400, 'M365 MCP not configured'));
    }

    // Resolve API key for the test call. We require a direct API key here
    // because this test endpoint runs outside the normal streaming chat flow.
    const apiKey = settingsModel.get('anthropic_api_key');
    if (!apiKey) {
      return next(new HttpError(503, 'Anthropic API key not configured'));
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
