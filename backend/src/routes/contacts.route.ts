import { Router } from 'express';
import { contactModel } from '../models/contact.model.js';
import { organizationModel } from '../models/organization.model.js';
import {
  ContactCreateSchema,
  ContactListQuerySchema,
  ContactUpdateSchema,
  WwtDirectoryImportSchema,
  WwtDirectorySearchQuerySchema,
} from '../schemas/contact.schema.js';
import { validateBody, validateQuery } from '../lib/validate.js';
import { bumpOrgVersion, runContactEnrichment } from '../services/claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';
import { searchWwtDirectory } from '../services/outlookDirectory.service.js';

export const contactsRouter = Router();

function ensureWwtOrganizationId(): number {
  const existing = organizationModel
    .listByType('oem')
    .find((org) => org.name.toLowerCase() === 'wwt');
  if (existing) return existing.id;
  return organizationModel.create({
    type: 'oem',
    name: 'WWT',
    metadata: { internal: true },
  }).id;
}

// GET /?org_id=&q=
contactsRouter.get('/', validateQuery(ContactListQuerySchema), (req, res) => {
  const q = req.validated as { org_id?: number; q?: string };
  res.json(contactModel.listAll({ org_id: q.org_id, query: q.q }));
});

// GET /directory/search?q=
contactsRouter.get('/directory/search', validateQuery(WwtDirectorySearchQuerySchema), async (req, res, next) => {
  const q = req.validated as { q: string; limit?: number };
  try {
    res.json(await searchWwtDirectory(q.q, q.limit ?? 20));
  } catch (err) {
    next(err);
  }
});

// POST /directory/import
contactsRouter.post('/directory/import', validateBody(WwtDirectoryImportSchema), (req, res) => {
  const input = req.validated as {
    name: string;
    email: string;
    title?: string | null;
    phone?: string | null;
    department?: string | null;
    office?: string | null;
  };
  const existing = contactModel.getByEmail(input.email);
  if (existing) {
    const updated = contactModel.update(existing.id, {
      name: input.name,
      title: input.title ?? existing.title,
      phone: input.phone ?? existing.phone,
      role: existing.role ?? 'wwt_resource',
      details: existing.details ?? [
        input.department ? `Department: ${input.department}` : null,
        input.office ? `Office: ${input.office}` : null,
      ].filter(Boolean).join('\n'),
    });
    res.json(updated ?? existing);
    return;
  }

  const organizationId = ensureWwtOrganizationId();
  const details = [
    input.department ? `Department: ${input.department}` : null,
    input.office ? `Office: ${input.office}` : null,
  ].filter(Boolean).join('\n');
  const contact = contactModel.create({
    organization_id: organizationId,
    name: input.name,
    title: input.title ?? null,
    email: input.email,
    phone: input.phone ?? null,
    role: 'wwt_resource',
    details: details || null,
  });
  bumpOrgVersion(organizationId);
  res.status(201).json(contact);
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
