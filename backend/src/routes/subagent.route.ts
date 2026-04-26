/**
 * subagent.route.ts — endpoints for the personal-subscription delegation
 * + usage dashboard tile.
 *
 *   POST /api/subagent/delegate          — run a one-shot Claude task
 *   POST /api/subagent/delegate-agentic  — run an agentic coding loop
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
import { anthropicUsageModel } from '../models/anthropicUsage.model.js';

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

// Defensive 404 — explicit so the regex doesn't match unknown sub-paths.
subagentRouter.use((_req, _res, next) => {
  next(new HttpError(404, 'Subagent route not found'));
});
