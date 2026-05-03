import { Router } from 'express';
import { validateBody, validateQuery } from '../lib/validate.js';
import {
  BomToolAnalyzeSchema,
  BomToolFilesQuerySchema,
  BomToolMoveSchema,
  BomToolUploadSchema,
  type BomToolAnalyze,
  type BomToolFilesQuery,
  type BomToolMove,
  type BomToolUpload,
} from '../schemas/bomTool.schema.js';
import {
  analyzeBomToolFiles,
  listBomToolFiles,
  moveBomToolFiles,
  uploadBomToolFiles,
} from '../services/bomTool.service.js';

export const bomToolRouter = Router();

bomToolRouter.get('/files', validateQuery(BomToolFilesQuerySchema), async (req, res, next) => {
  try {
    const query = req.validatedQuery as BomToolFilesQuery;
    res.json(await listBomToolFiles(query.org_id));
  } catch (err) {
    next(err);
  }
});

bomToolRouter.post('/upload', validateBody(BomToolUploadSchema), async (req, res, next) => {
  try {
    const body = req.validatedBody as BomToolUpload;
    res.status(201).json(await uploadBomToolFiles(body));
  } catch (err) {
    next(err);
  }
});

bomToolRouter.post('/analyze', validateBody(BomToolAnalyzeSchema), async (req, res, next) => {
  try {
    const body = req.validatedBody as BomToolAnalyze;
    res.json(await analyzeBomToolFiles(body));
  } catch (err) {
    next(err);
  }
});

bomToolRouter.post('/move', validateBody(BomToolMoveSchema), async (req, res, next) => {
  try {
    const body = req.validatedBody as BomToolMove;
    res.json(await moveBomToolFiles(body));
  } catch (err) {
    next(err);
  }
});
