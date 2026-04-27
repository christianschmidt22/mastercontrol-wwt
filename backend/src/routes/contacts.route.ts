import { Router } from 'express';
import { contactModel } from '../models/contact.model.js';
import { ContactCreateSchema, ContactUpdateSchema } from '../schemas/contact.schema.js';
import { validateBody } from '../lib/validate.js';
import { bumpOrgVersion } from '../services/claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';

export const contactsRouter = Router();

// POST /
contactsRouter.post('/', validateBody(ContactCreateSchema), (req, res) => {
  const input = req.validated as {
    organization_id: number;
    name: string;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    assigned_org_ids?: number[];
  };
  const contact = contactModel.create(input);
  bumpOrgVersion(input.organization_id);
  res.status(201).json(contact);
});

// PUT /:id
contactsRouter.put('/:id', validateBody(ContactUpdateSchema), (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const existing = contactModel.get(id);
  if (!existing) return next(new HttpError(404, 'Contact not found'));
  const patch = req.validated as {
    name?: string;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    assigned_org_ids?: number[];
  };
  const updated = contactModel.update(id, patch);
  if (!updated) return next(new HttpError(404, 'Contact not found'));
  bumpOrgVersion(existing.organization_id);
  res.json(updated);
});

// DELETE /:id
contactsRouter.delete('/:id', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const existing = contactModel.get(id);
  if (!existing) return next(new HttpError(404, 'Contact not found'));
  const removed = contactModel.remove(id);
  if (!removed) return next(new HttpError(404, 'Contact not found'));
  bumpOrgVersion(existing.organization_id);
  res.status(204).end();
});
