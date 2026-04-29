import { Router } from 'express';
import {
  loadMasterNote,
  processMasterNote,
  saveMasterNote,
} from '../services/masterNote.service.js';
import {
  MasterNoteSaveSchema,
  OrgIdParamsSchema,
  OrgProjectIdParamsSchema,
} from '../schemas/masterNote.schema.js';
import { validateBody, validateParams } from '../lib/validate.js';
import { HttpError } from '../middleware/errorHandler.js';
import { logAlert } from '../models/systemAlert.model.js';
import { bumpOrgVersion } from '../services/claude.service.js';

export const masterNotesRouter = Router();

// GET /api/master-notes/orgs/:orgId — load org-scoped master note
masterNotesRouter.get(
  '/orgs/:orgId',
  validateParams(OrgIdParamsSchema),
  (req, res) => {
    const { orgId } = req.validatedParams as { orgId: number };
    res.json(loadMasterNote(orgId, null));
  },
);

// PUT /api/master-notes/orgs/:orgId — autosave org-scoped master note
masterNotesRouter.put(
  '/orgs/:orgId',
  validateParams(OrgIdParamsSchema),
  validateBody(MasterNoteSaveSchema),
  (req, res) => {
    const { orgId } = req.validatedParams as { orgId: number };
    const { content } = req.validatedBody as { content: string };
    const saved = saveMasterNote({
      organization_id: orgId,
      project_id: null,
      content,
    });
    res.json(saved);
  },
);

// POST /api/master-notes/orgs/:orgId/process — run extraction now
masterNotesRouter.post(
  '/orgs/:orgId/process',
  validateParams(OrgIdParamsSchema),
  async (req, res, next) => {
    const { orgId } = req.validatedParams as { orgId: number };
    const note = loadMasterNote(orgId, null);
    try {
      const result = await processMasterNote(note.id, { force: true });
      bumpOrgVersion(orgId);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logAlert('warn', 'noteExtraction', `Master-note processing failed: ${message}`, {
        master_note_id: note.id,
      });
      next(err);
    }
  },
);

// GET /api/master-notes/orgs/:orgId/projects/:projectId — load project-scoped master note
masterNotesRouter.get(
  '/orgs/:orgId/projects/:projectId',
  validateParams(OrgProjectIdParamsSchema),
  (req, res, next) => {
    const { orgId, projectId } = req.validatedParams as { orgId: number; projectId: number };
    try {
      res.json(loadMasterNote(orgId, projectId));
    } catch (err) {
      if (err instanceof HttpError) return next(err);
      throw err;
    }
  },
);

// PUT /api/master-notes/orgs/:orgId/projects/:projectId — autosave project-scoped master note
masterNotesRouter.put(
  '/orgs/:orgId/projects/:projectId',
  validateParams(OrgProjectIdParamsSchema),
  validateBody(MasterNoteSaveSchema),
  (req, res) => {
    const { orgId, projectId } = req.validatedParams as { orgId: number; projectId: number };
    const { content } = req.validatedBody as { content: string };
    const saved = saveMasterNote({
      organization_id: orgId,
      project_id: projectId,
      content,
    });
    res.json(saved);
  },
);

// POST /api/master-notes/orgs/:orgId/projects/:projectId/process — run extraction now
masterNotesRouter.post(
  '/orgs/:orgId/projects/:projectId/process',
  validateParams(OrgProjectIdParamsSchema),
  async (req, res, next) => {
    const { orgId, projectId } = req.validatedParams as { orgId: number; projectId: number };
    const note = loadMasterNote(orgId, projectId);
    try {
      const result = await processMasterNote(note.id, { force: true });
      bumpOrgVersion(orgId);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logAlert('warn', 'noteExtraction', `Master-note processing failed: ${message}`, {
        master_note_id: note.id,
      });
      next(err);
    }
  },
);
