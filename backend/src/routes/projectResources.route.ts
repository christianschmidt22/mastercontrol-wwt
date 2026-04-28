import { Router, type Request } from 'express';
import { projectResourceModel } from '../models/projectResource.model.js';
import { projectModel } from '../models/project.model.js';
import {
  ProjectResourceCreateSchema,
  ProjectResourceUpdateSchema,
} from '../schemas/projectResource.schema.js';
import { validateBody } from '../lib/validate.js';
import { HttpError } from '../middleware/errorHandler.js';

export const projectResourcesRouter = Router({ mergeParams: true });

function parseProjectId(req: Request): number {
  // mergeParams: true merges parent route params into req.params at runtime,
  // but TypeScript types req.params as {} on a child router. Cast is safe here.
  const raw = (req.params as Record<string, string>)['projectId'];
  return Number(raw);
}

// GET /api/projects/:projectId/resources
projectResourcesRouter.get('/', (req, res, next) => {
  const projectId = parseProjectId(req);
  if (!Number.isInteger(projectId) || projectId <= 0)
    return next(new HttpError(400, 'Invalid projectId'));
  if (!projectModel.get(projectId)) return next(new HttpError(404, 'Project not found'));
  res.json(projectResourceModel.listByProject(projectId));
});

// POST /api/projects/:projectId/resources
projectResourcesRouter.post('/', validateBody(ProjectResourceCreateSchema), (req, res, next) => {
  const projectId = parseProjectId(req);
  if (!Number.isInteger(projectId) || projectId <= 0)
    return next(new HttpError(400, 'Invalid projectId'));
  const project = projectModel.get(projectId);
  if (!project) return next(new HttpError(404, 'Project not found'));
  const input = req.validated as { name: string; role?: string | null; team?: string | null; notes?: string | null };
  const resource = projectResourceModel.create({
    project_id: projectId,
    organization_id: project.organization_id,
    name: input.name,
    role: input.role ?? null,
    team: input.team ?? null,
    notes: input.notes ?? null,
  });
  res.status(201).json(resource);
});

// PUT /api/projects/:projectId/resources/:id
projectResourcesRouter.put('/:id', validateBody(ProjectResourceUpdateSchema), (req, res, next) => {
  const projectId = parseProjectId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(id) || id <= 0)
    return next(new HttpError(400, 'Invalid id'));
  const patch = req.validated as { name?: string; role?: string | null; team?: string | null; notes?: string | null };
  const updated = projectResourceModel.update(id, patch);
  if (!updated) return next(new HttpError(404, 'Resource not found'));
  res.json(updated);
});

// DELETE /api/projects/:projectId/resources/:id
projectResourcesRouter.delete('/:id', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const removed = projectResourceModel.remove(id);
  if (!removed) return next(new HttpError(404, 'Resource not found'));
  res.status(204).end();
});
