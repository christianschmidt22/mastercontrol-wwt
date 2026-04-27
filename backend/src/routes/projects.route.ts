import { Router } from 'express';
import { organizationModel } from '../models/organization.model.js';
import { projectModel } from '../models/project.model.js';
import { ProjectCreateSchema, ProjectUpdateSchema } from '../schemas/project.schema.js';
import { validateBody } from '../lib/validate.js';
import { bumpOrgVersion } from '../services/claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';
import { ensureProjectFolder } from '../services/fileSpace.service.js';

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
  const org = organizationModel.get(input.organization_id);
  if (!org) throw new HttpError(404, 'Organization not found');
  const docUrl =
    input.doc_url && input.doc_url.trim()
      ? input.doc_url
      : ensureProjectFolder(org, input.name).path;
  const project = projectModel.create({ ...input, doc_url: docUrl });
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
  const org = organizationModel.get(existing.organization_id);
  if (!org) return next(new HttpError(404, 'Organization not found'));
  const effectiveName = patch.name ?? existing.name;
  const patchWithFileSpace =
    patch.doc_url === undefined && existing.doc_url === null
      ? { ...patch, doc_url: ensureProjectFolder(org, effectiveName).path }
      : patch;
  const updated = projectModel.update(id, patchWithFileSpace);
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
