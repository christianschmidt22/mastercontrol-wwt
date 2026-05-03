import { Router } from 'express';
import { contactModel } from '../models/contact.model.js';
import { ContactCreateSchema, ContactListQuerySchema, ContactUpdateSchema } from '../schemas/contact.schema.js';
import { validateBody, validateQuery } from '../lib/validate.js';
import { bumpOrgVersion, runContactEnrichment } from '../services/claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';

export const contactsRouter = Router();

// GET /?org_id=&q=
contactsRouter.get('/', validateQuery(ContactListQuerySchema), (req, res) => {
  const q = req.validated as { org_id?: number; q?: string };
  res.json(contactModel.listAll({ org_id: q.org_id, query: q.q }));
});

// POST /
contactsRouter.post('/', validateBody(ContactCreateSchema), (req, res) => {
  const input = req.validated as {
    organization_id: number;
    name: string;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    details?: string | null;
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
    details?: string | null;
    assigned_org_ids?: number[];
  };
  const updated = contactModel.update(id, patch);
  if (!updated) return next(new HttpError(404, 'Contact not found'));
  bumpOrgVersion(existing.organization_id);
  res.json(updated);
});

// POST /:id/enrich
contactsRouter.post('/:id/enrich', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const contact = contactModel.get(id);
  if (!contact) return next(new HttpError(404, 'Contact not found'));
  try {
    res.json(await runContactEnrichment(contact));
  } catch (err) {
    next(err);
  }
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
