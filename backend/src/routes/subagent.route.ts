/**
 * subagent.route.ts — endpoints for the personal-subscription delegation
 * + usage dashboard tile.
 *
 *   POST /api/subagent/delegate          — run a one-shot Claude task (API key)
 *   POST /api/subagent/delegate-agentic  — run an agentic coding loop (API key)
 *   POST /api/subagent/delegate-sdk      — agentic loop via subscription login
 *   GET  /api/subagent/auth-status       — { subscription_authenticated, api_key_configured }
 *   GET  /api/subagent/usage?period=...  — period aggregate
 *   GET  /api/subagent/usage/recent      — last N usage events
 */
import { Router } from 'express';
import { validateBody, validateQuery } from '../lib/validate.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  DelegateRequestSchema,
  AgenticDelegateRequestSchema,
  UsageQuerySchema,
  RecentUsageQuerySchema,
  type DelegateRequest,
  type AgenticDelegateRequest,
  type UsagePeriodValue,
} from '../schemas/subagent.schema.js';
import { delegate, delegateAgentic, getSessionStart } from '../services/subagent.service.js';
import { delegateViaSubscription, hasClaudeCodeCredentials } from '../services/subagentSdk.service.js';
import { anthropicUsageModel } from '../models/anthropicUsage.model.js';
import { settingsModel } from '../models/settings.model.js';
import { openSse } from '../lib/sse.js';

export const subagentRouter = Router();

// POST /api/subagent/delegate ----------------------------------------------
subagentRouter.post(
  '/delegate',
  validateBody(DelegateRequestSchema),
  async (req, res, next) => {
    try {
      const body = req.validatedBody as DelegateRequest;
      const result = await delegate(body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/subagent/delegate-agentic --------------------------------------
subagentRouter.post(
  '/delegate-agentic',
  validateBody(AgenticDelegateRequestSchema),
  async (req, res, next) => {
    try {
      const body = req.validatedBody as AgenticDelegateRequest;
      const result = await delegateAgentic(body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/subagent/delegate-sdk ----------------------------------------
subagentRouter.post(
  '/delegate-sdk',
  validateBody(AgenticDelegateRequestSchema),
  async (req, res, next) => {
    try {
      const body = req.validatedBody as AgenticDelegateRequest;
      const result = await delegateViaSubscription(body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/subagent/delegate-agentic-stream ---------------------------------
//
// Same request body as /delegate-agentic but response is text/event-stream.
// Each transcript entry is sent as:
//   data: {"type":"transcript","entry":{...}}\n\n
// On completion:
//   data: {"type":"done","total_usage":{...},"total_cost_usd":N,"iterations":N,"stopped_reason":"..."}\n\n
// On error:
//   data: {"type":"error","error":"...","transcript_so_far":[...]}\n\n
subagentRouter.post(
  '/delegate-agentic-stream',
  validateBody(AgenticDelegateRequestSchema),
  async (req, res, next) => {
    const body = req.validatedBody as AgenticDelegateRequest;
    const sse = openSse(req, res);

    // Run the agentic loop with an onEvent callback that streams each entry.
    let result;
    try {
      result = await Promise.race([
        delegateAgentic(body, {
          onEvent: (entry) => {
            sse.send({ type: 'transcript', entry });
          },
        }),
        // If the client disconnects mid-run, we still let delegateAgentic
        // finish (it's non-cancellable mid-API-call), but we stop writing SSE
        // frames because sse.send() is a no-op once disconnected.
        sse.disconnected.then((): null => null),
      ]);
    } catch (err) {
      // HttpError (bad config, missing key, etc.) — send error frame.
      const message = err instanceof Error ? err.message : String(err);
      sse.send({ type: 'error', error: message, transcript_so_far: [] });
      sse.end();
      // Also pass to next() so the error handler logs it.
      next(err);
      return;
    }

    if (result === null) {
      // Client disconnected before the run finished.
      sse.end();
      return;
    }

    if (!result.ok) {
      sse.send({
        type: 'error',
        error: result.error,
        transcript_so_far: result.transcript_so_far,
      });
    } else {
      sse.send({
        type: 'done',
        total_usage: result.total_usage,
        total_cost_usd: result.total_cost_usd,
        iterations: result.iterations,
        stopped_reason: result.stopped_reason,
      });
    }
    sse.end();
  },
);

// POST /api/subagent/delegate-sdk-stream -------------------------------------
//
// Same request body as /delegate-sdk but response is text/event-stream.
// Same SSE event protocol as /delegate-agentic-stream above.
subagentRouter.post(
  '/delegate-sdk-stream',
  validateBody(AgenticDelegateRequestSchema),
  async (req, res, next) => {
    const body = req.validatedBody as AgenticDelegateRequest;
    const sse = openSse(req, res);

    let result;
    try {
      result = await Promise.race([
        delegateViaSubscription(body, {
          onEvent: (entry) => {
            sse.send({ type: 'transcript', entry });
          },
        }),
        sse.disconnected.then((): null => null),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sse.send({ type: 'error', error: message, transcript_so_far: [] });
      sse.end();
      next(err);
      return;
    }

    if (result === null) {
      sse.end();
      return;
    }

    if (!result.ok) {
      sse.send({
        type: 'error',
        error: result.error,
        transcript_so_far: result.transcript_so_far,
      });
    } else {
      sse.send({
        type: 'done',
        total_usage: result.total_usage,
        total_cost_usd: result.total_cost_usd,
        iterations: result.iterations,
        stopped_reason: result.stopped_reason,
      });
    }
    sse.end();
  },
);

// GET /api/subagent/usage?period=session|today|week|all -------------------
subagentRouter.get(
  '/usage',
  validateQuery(UsageQuerySchema),
  (req, res, next) => {
    try {
      const { period } = req.validatedQuery as { period: UsagePeriodValue };
      const aggregate = anthropicUsageModel.aggregate(period, getSessionStart());
      res.json({
        ...aggregate,
        session_start: period === 'session' ? getSessionStart() : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/subagent/usage/recent?limit=N ----------------------------------
subagentRouter.get(
  '/usage/recent',
  validateQuery(RecentUsageQuerySchema),
  (req, res, next) => {
    try {
      const { limit } = req.validatedQuery as { limit?: number };
      const events = anthropicUsageModel.recent(limit ?? 20);
      res.json(events);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/subagent/auth-status ------------------------------------------
//
// Lightweight probe used by the frontend's auth-mode toggle. Returns
// whether a Claude.ai subscription credentials file exists at
// `~/.claude/.credentials.json` (set by `claude /login`) and whether the
// fallback `personal_anthropic_api_key` is configured. The frontend polls
// this every ~30s and renders a green/grey badge from the result. Either
// flag being true means that auth mode will at least *start* — actual
// credential validity (expired tokens, revoked keys) only surfaces when
// the user runs a delegation.
subagentRouter.get('/auth-status', (_req, res, next) => {
  try {
    const subscription_authenticated = hasClaudeCodeCredentials();
    const apiKey = settingsModel.get('personal_anthropic_api_key');
    const api_key_configured = typeof apiKey === 'string' && apiKey.length > 0;
    const coreApiKey = settingsModel.get('anthropic_api_key');
    const core_api_key_configured = typeof coreApiKey === 'string' && coreApiKey.length > 0;
    const core_auth_mode = settingsModel.get('claude_auth_mode') ?? 'auto';
    res.json({
      subscription_authenticated,
      api_key_configured,
      core_api_key_configured,
      core_auth_mode,
    });
  } catch (err) {
    next(err);
  }
});

// Defensive 404 — explicit so the regex doesn't match unknown sub-paths.
subagentRouter.use((_req, _res, next) => {
  next(new HttpError(404, 'Subagent route not found'));
});
