import { Router } from 'express';
import { noteModel } from '../models/note.model.js';
import { NoteCreateSchema } from '../schemas/note.schema.js';
import { validateBody } from '../lib/validate.js';
import { bumpOrgVersion } from '../services/claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';

export const notesRouter = Router();

// POST / — manual note save
notesRouter.post('/', validateBody(NoteCreateSchema), (req, res) => {
  const input = req.validated as {
    organization_id: number;
    content: string;
    role?: 'user' | 'assistant' | 'agent_insight' | 'imported';
    thread_id?: number | null;
  };
  const note = noteModel.create({
    organization_id: input.organization_id,
    content: input.content,
    role: input.role ?? 'user',
    thread_id: input.thread_id ?? null,
  });
  bumpOrgVersion(input.organization_id);
  res.status(201).json(note);
});

// POST /:id/confirm — R-002: accept an agent_insight note
notesRouter.post('/:id/confirm', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const note = noteModel.get(id);
  if (!note) return next(new HttpError(404, 'Note not found'));
  const confirmed = noteModel.confirm(id);
  if (!confirmed) return next(new HttpError(404, 'Note not found'));
  bumpOrgVersion(note.organization_id);
  res.json({ ok: true });
});

// DELETE /:id/reject — R-002: reject (hard-delete) an agent_insight note
notesRouter.delete('/:id/reject', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const note = noteModel.get(id);
  if (!note) return next(new HttpError(404, 'Note not found'));
  noteModel.reject(id);
  bumpOrgVersion(note.organization_id);
  res.status(204).end();
});

// DELETE /:id — remove any note
notesRouter.delete('/:id', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const note = noteModel.get(id);
  if (!note) return next(new HttpError(404, 'Note not found'));
  noteModel.remove(id);
  bumpOrgVersion(note.organization_id);
  res.status(204).end();
});
