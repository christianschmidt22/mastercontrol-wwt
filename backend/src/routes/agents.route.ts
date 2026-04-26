import { Router } from 'express';
import { agentConfigModel } from '../models/agentConfig.model.js';
import { agentThreadModel } from '../models/agentThread.model.js';
import { agentMessageModel } from '../models/agentMessage.model.js';
import { agentToolAuditModel } from '../models/agentToolAudit.model.js';
import { organizationModel } from '../models/organization.model.js';
import {
  AgentConfigUpdateSchema,
  AgentThreadCreateSchema,
  AgentThreadListQuerySchema,
  AgentChatBodySchema,
  AuditListQuerySchema,
} from '../schemas/agentConfig.schema.js';
import { validateBody, validateQuery } from '../lib/validate.js';
import { streamChat } from '../services/claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';

export const agentsRouter = Router();

// GET /configs — both archetypes + all overrides
agentsRouter.get('/configs', (_req, res) => {
  res.json(agentConfigModel.listAll());
});

// PUT /configs/:id — update template/tools/model
agentsRouter.put('/configs/:id', validateBody(AgentConfigUpdateSchema), (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const patch = req.validated as {
    system_prompt_template?: string;
    tools_enabled?: Record<string, unknown>;
    model?: string;
  };
  const updated = agentConfigModel.updateById(id, patch);
  if (!updated) return next(new HttpError(404, 'Config not found'));
  res.json(updated);
});

// GET /threads?org_id=&limit=  — org_id is optional; omit for cross-org list
agentsRouter.get('/threads', validateQuery(AgentThreadListQuerySchema), (req, res) => {
  const { org_id, limit } = req.validated as { org_id?: number; limit?: number };
  if (org_id !== undefined) {
    res.json(agentThreadModel.listFor(org_id));
  } else {
    res.json(agentThreadModel.listAll(limit ?? 50));
  }
});

// POST /threads
agentsRouter.post('/threads', validateBody(AgentThreadCreateSchema), (req, res, next) => {
  const { organization_id, title } = req.validated as { organization_id: number; title?: string };
  if (!organizationModel.get(organization_id)) {
    return next(new HttpError(404, 'Organization not found'));
  }
  const thread = agentThreadModel.create({ organization_id, title });
  res.status(201).json(thread);
});

// GET /threads/:id/messages
agentsRouter.get('/threads/:id/messages', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const thread = agentThreadModel.get(id);
  if (!thread) return next(new HttpError(404, 'Thread not found'));
  res.json(agentMessageModel.listByThread(id));
});

// GET /audit?thread_id=
agentsRouter.get('/audit', validateQuery(AuditListQuerySchema), (req, res) => {
  const { thread_id } = req.validated as { thread_id: number };
  res.json(agentToolAuditModel.listByThread(thread_id));
});

// POST /:org_id/chat — SSE streaming endpoint
agentsRouter.post('/:org_id/chat', validateBody(AgentChatBodySchema), async (req, res, next) => {
  const orgId = Number(req.params.org_id);
  if (!Number.isInteger(orgId) || orgId <= 0) return next(new HttpError(400, 'Invalid org_id'));

  const org = organizationModel.get(orgId);
  if (!org) return next(new HttpError(404, 'Organization not found'));

  const { thread_id, content } = req.validated as { thread_id?: number; content: string };

  let threadId = thread_id;
  if (!threadId) {
    const newThread = agentThreadModel.create({ organization_id: orgId });
    threadId = newThread.id;
  } else {
    const thread = agentThreadModel.get(threadId);
    if (!thread) return next(new HttpError(404, 'Thread not found'));
    if (thread.organization_id !== orgId) return next(new HttpError(400, 'Thread does not belong to this org'));
  }

  try {
    await streamChat({ orgId, threadId, content, req, res });
  } catch (err) {
    next(err);
  }
});
