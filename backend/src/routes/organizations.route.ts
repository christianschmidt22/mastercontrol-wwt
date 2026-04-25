import { Router } from 'express';
import { organizationModel } from '../models/organization.model.js';
import { contactModel } from '../models/contact.model.js';
import { projectModel } from '../models/project.model.js';
import { documentModel } from '../models/document.model.js';
import { noteModel } from '../models/note.model.js';
import {
  OrganizationCreateSchema,
  OrganizationUpdateSchema,
  OrgTypeQuerySchema,
  OrgNotesQuerySchema,
} from '../schemas/organization.schema.js';
import { validateBody, validateQuery } from '../lib/validate.js';
import { bumpOrgVersion } from '../services/claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';

export const organizationsRouter = Router();

// GET /?type=customer|oem
organizationsRouter.get('/', validateQuery(OrgTypeQuerySchema), (req, res) => {
  const { type } = req.validated as { type: 'customer' | 'oem' };
  res.json(organizationModel.listByType(type));
});

// POST /
organizationsRouter.post('/', validateBody(OrganizationCreateSchema), (req, res) => {
  const input = req.validated as { type: 'customer' | 'oem'; name: string; metadata?: Record<string, unknown> };
  const org = organizationModel.create(input);
  res.status(201).json(org);
});

// GET /:id
organizationsRouter.get('/:id', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const org = organizationModel.get(id);
  if (!org) return next(new HttpError(404, 'Organization not found'));
  res.json(org);
});

// PUT /:id
organizationsRouter.put('/:id', validateBody(OrganizationUpdateSchema), (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const { name, metadata } = req.validated as { name: string; metadata?: Record<string, unknown> };
  const org = organizationModel.update(id, name, metadata ?? {});
  if (!org) return next(new HttpError(404, 'Organization not found'));
  bumpOrgVersion(id);
  res.json(org);
});

// DELETE /:id
organizationsRouter.delete('/:id', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const removed = organizationModel.remove(id);
  if (!removed) return next(new HttpError(404, 'Organization not found'));
  res.status(204).end();
});

// GET /:id/contacts
organizationsRouter.get('/:id/contacts', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  if (!organizationModel.get(id)) return next(new HttpError(404, 'Organization not found'));
  res.json(contactModel.listFor(id));
});

// GET /:id/projects
organizationsRouter.get('/:id/projects', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  if (!organizationModel.get(id)) return next(new HttpError(404, 'Organization not found'));
  res.json(projectModel.listFor(id));
});

// GET /:id/documents
organizationsRouter.get('/:id/documents', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  if (!organizationModel.get(id)) return next(new HttpError(404, 'Organization not found'));
  res.json(documentModel.listFor(id));
});

// GET /:id/notes?limit=20&include_unconfirmed=true|false
organizationsRouter.get('/:id/notes', validateQuery(OrgNotesQuerySchema), (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  if (!organizationModel.get(id)) return next(new HttpError(404, 'Organization not found'));
  const q = req.validated as { limit?: number; include_unconfirmed?: string };
  const includeUnconfirmed = q.include_unconfirmed !== 'false'; // default true
  const notes = noteModel.listFor(id, includeUnconfirmed).slice(0, q.limit ?? 20);
  res.json(notes);
});
