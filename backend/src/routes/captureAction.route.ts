import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { CaptureActionRunSchema, type CaptureActionRunInput } from '../schemas/captureAction.schema.js';
import { runCaptureAction } from '../services/claude.service.js';

export const captureActionRouter = Router();

captureActionRouter.post('/run', validateBody(CaptureActionRunSchema), async (req, res, next) => {
  try {
    const result = await runCaptureAction(req.validated as CaptureActionRunInput);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
