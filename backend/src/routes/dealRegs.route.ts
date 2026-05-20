import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { HttpError } from '../middleware/errorHandler.js';
import { dealRegModel } from '../models/dealReg.model.js';
import { DealRegInputSchema, type DealRegInput } from '../schemas/dealReg.schema.js';

export const dealRegsRouter = Router();

function parseId(raw: string | string[] | undefined): number {
  if (Array.isArray(raw) || raw == null) throw new HttpError(400, 'Invalid deal reg id');
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid deal reg id');
  return id;
}

dealRegsRouter.get('/', (_req, res) => {
  res.json(dealRegModel.list());
});

dealRegsRouter.post('/', validateBody(DealRegInputSchema), (req, res) => {
  res.status(201).json(dealRegModel.create(req.validatedBody as DealRegInput));
});

dealRegsRouter.put('/:id', validateBody(DealRegInputSchema), (req, res, next) => {
  try {
    const updated = dealRegModel.update(parseId(req.params.id), req.validatedBody as DealRegInput);
    if (!updated) return next(new HttpError(404, 'Deal reg not found'));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

dealRegsRouter.delete('/:id', (req, res, next) => {
  try {
    if (!dealRegModel.delete(parseId(req.params.id))) {
      return next(new HttpError(404, 'Deal reg not found'));
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
