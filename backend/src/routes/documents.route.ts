import { Router } from 'express';
import { documentModel } from '../models/document.model.js';
import { DocumentCreateSchema } from '../schemas/document.schema.js';
import { validateBody } from '../lib/validate.js';
import { bumpOrgVersion } from '../services/claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';

export const documentsRouter = Router();

// POST /
documentsRouter.post('/', validateBody(DocumentCreateSchema), (req, res) => {
  const input = req.validated as {
    organization_id: number;
    kind: 'link' | 'file';
    label: string;
    url_or_path: string;
    source?: 'manual' | 'onedrive_scan';
  };
  const doc = documentModel.create(input);
  bumpOrgVersion(input.organization_id);
  res.status(201).json(doc);
});

// DELETE /:id
documentsRouter.delete('/:id', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const existing = documentModel.get(id);
  if (!existing) return next(new HttpError(404, 'Document not found'));
  const removed = documentModel.remove(id);
  if (!removed) return next(new HttpError(404, 'Document not found'));
  bumpOrgVersion(existing.organization_id);
  res.status(204).end();
});
