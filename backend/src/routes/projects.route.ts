import { Router } from 'express';
import { projectModel } from '../models/project.model.js';
import { ProjectCreateSchema, ProjectUpdateSchema } from '../schemas/project.schema.js';
import { validateBody } from '../lib/validate.js';
import { bumpOrgVersion } from '../services/claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';

export const projectsRouter = Router();

// POST /
projectsRouter.post('/', validateBody(ProjectCreateSchema), (req, res) => {
  const input = req.validated as {
    organization_id: number;
    name: string;
    status?: string;
    description?: string | null;
    doc_url?: string | null;
    notes_url?: string | null;
  };
  const project = projectModel.create(input);
  bumpOrgVersion(input.organization_id);
  res.status(201).json(project);
});

// PUT /:id
projectsRouter.put('/:id', validateBody(ProjectUpdateSchema), (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const existing = projectModel.get(id);
  if (!existing) return next(new HttpError(404, 'Project not found'));
  const patch = req.validated as {
    name?: string;
    status?: string;
    description?: string | null;
    doc_url?: string | null;
    notes_url?: string | null;
  };
  const updated = projectModel.update(id, patch);
  if (!updated) return next(new HttpError(404, 'Project not found'));
  bumpOrgVersion(existing.organization_id);
  res.json(updated);
});

// DELETE /:id
projectsRouter.delete('/:id', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const existing = projectModel.get(id);
  if (!existing) return next(new HttpError(404, 'Project not found'));
  const removed = projectModel.remove(id);
  if (!removed) return next(new HttpError(404, 'Project not found'));
  bumpOrgVersion(existing.organization_id);
  res.status(204).end();
});
