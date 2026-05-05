import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { FreetimeFindSchema } from '../schemas/freetime.schema.js';
import { findFreetime, type FindFreetimeInput } from '../services/freetime.service.js';

export const freetimeRouter = Router();

freetimeRouter.post('/find', validateBody(FreetimeFindSchema), async (req, res, next) => {
  try {
    res.json(await findFreetime(req.validated as FindFreetimeInput));
  } catch (err) {
    next(err);
  }
});
