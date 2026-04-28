import { Router } from 'express';
import { noteModel } from '../models/note.model.js';
import {
  CaptureNoteSchema,
  NoteCreateSchema,
  NoteProposalParamsSchema,
  NoteProposalQuerySchema,
  NoteProposalStatusUpdateSchema,
  RecentNotesQuerySchema,
  UnconfirmedInsightsQuerySchema,
  CrossOrgInsightsQuerySchema,
} from '../schemas/note.schema.js';
import { noteProposalModel } from '../models/noteProposal.model.js';
import { captureMarkdownNote } from '../services/noteCapture.service.js';
import { validateBody, validateParams, validateQuery } from '../lib/validate.js';
import { bumpOrgVersion } from '../services/claude.service.js';
import { extractMentions } from '../services/mention.service.js';
import { HttpError } from '../middleware/errorHandler.js';

export const notesRouter = Router();

// GET /recent?limit=10 — most recent user/assistant notes joined with org_name
notesRouter.get('/recent', validateQuery(RecentNotesQuerySchema), (req, res) => {
  const { limit } = req.validated as { limit?: number };
  res.json(noteModel.listRecentWithOrg(limit ?? 10));
});

// GET /unconfirmed?limit=N — aggregator: all unconfirmed agent_insight notes across orgs
notesRouter.get('/unconfirmed', validateQuery(UnconfirmedInsightsQuerySchema), (req, res) => {
  const { limit } = req.validated as { limit?: number };
  res.json(noteModel.listUnconfirmedAcrossOrgs(limit ?? 50));
});

// GET /cross-org-insights?org_id=X&limit=N — insights mentioning a specific org from OTHER orgs
notesRouter.get('/cross-org-insights', validateQuery(CrossOrgInsightsQuerySchema), (req, res) => {
  const { org_id, limit } = req.validated as { org_id: number; limit?: number };
  res.json(noteModel.listInsightsMentioningOrg(org_id, limit ?? 20));
});

// GET /proposals?status=pending&limit=20 - note ingest approval queue
notesRouter.get('/proposals', validateQuery(NoteProposalQuerySchema), (req, res) => {
  const { status, limit } = req.validated as {
    status?: 'pending' | 'approved' | 'denied' | 'discussing';
    limit?: number;
  };
  res.json(noteProposalModel.listByStatus(status ?? 'pending', limit ?? 20));
});

// POST /capture - durable markdown note capture + initial approval proposal
notesRouter.post('/capture', validateBody(CaptureNoteSchema), (req, res) => {
  const input = req.validated as {
    organization_id: number;
    project_id?: number | null;
    content: string;
    capture_source?: string | null;
  };
  const result = captureMarkdownNote(input);
  bumpOrgVersion(input.organization_id);

  void extractMentions(result.note.id, input.content).catch((err: unknown) => {
    console.warn('[notes] extractMentions failed (non-fatal)', {
      note_id: result.note.id,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  res.status(201).json(result);
});

// POST /proposals/:id/status - approve, deny, or discuss a proposed extraction
notesRouter.post(
  '/proposals/:id/status',
  validateParams(NoteProposalParamsSchema),
  validateBody(NoteProposalStatusUpdateSchema),
  (req, res, next) => {
    const { id } = req.validatedParams as { id: number };
    const { status, discussion } = req.validatedBody as {
      status: 'approved' | 'denied' | 'discussing';
      discussion?: string | null;
    };
    const proposal = noteProposalModel.setStatus(id, status, discussion);
    if (!proposal) return next(new HttpError(404, 'Note proposal not found'));
    bumpOrgVersion(proposal.organization_id);
    res.json(proposal);
  },
);

// POST / - manual note save
notesRouter.post('/', validateBody(NoteCreateSchema), (req, res) => {
  const input = req.validated as {
    organization_id: number;
    content: string;
    role?: 'user' | 'assistant' | 'agent_insight' | 'imported';
    thread_id?: number | null;
  };
  const role = input.role ?? 'user';
  const note = noteModel.create({
    organization_id: input.organization_id,
    content: input.content,
    role,
    thread_id: input.thread_id ?? null,
  });
  bumpOrgVersion(input.organization_id);

  // Best-effort cross-org mention extraction. Fire-and-forget — note save
  // returns immediately; the Anthropic call happens out-of-band. Only for
  // user-authored or imported content; assistant + agent_insight rows are
  // already produced by the agent runtime which has its own context.
  if (role === 'user' || role === 'imported') {
    void extractMentions(note.id, input.content).catch((err: unknown) => {
      console.warn('[notes] extractMentions failed (non-fatal)', {
        note_id: note.id,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

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
