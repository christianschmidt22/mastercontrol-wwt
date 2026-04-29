import { Router } from 'express';
import { backlogItemModel } from '../models/backlogItem.model.js';
import {
  BacklogItemCreateSchema,
  BacklogItemParamsSchema,
  BacklogItemQuerySchema,
  BacklogItemUpdateSchema,
} from '../schemas/backlogItem.schema.js';
import { validateBody, validateParams, validateQuery } from '../lib/validate.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { BacklogStatus } from '../models/backlogItem.model.js';

export const backlogItemsRouter = Router();

backlogItemsRouter.get('/', validateQuery(BacklogItemQuerySchema), (req, res) => {
  const { status } = req.validated as { status?: BacklogStatus };
  res.json(backlogItemModel.list(status));
});

backlogItemsRouter.post('/', validateBody(BacklogItemCreateSchema), (req, res) => {
  const input = req.validated as {
    title: string;
    notes?: string | null;
    due_date?: string | null;
    status?: BacklogStatus;
  };
  res.status(201).json(backlogItemModel.create(input));
});

backlogItemsRouter.get(
  '/:id',
  validateParams(BacklogItemParamsSchema),
  (req, res, next) => {
    const { id } = req.validatedParams as { id: number };
    const item = backlogItemModel.get(id);
    if (!item) return next(new HttpError(404, 'Backlog item not found'));
    res.json(item);
  },
);

backlogItemsRouter.put(
  '/:id',
  validateParams(BacklogItemParamsSchema),
  validateBody(BacklogItemUpdateSchema),
  (req, res, next) => {
    const { id } = req.validatedParams as { id: number };
    const patch = req.validatedBody as {
      title?: string;
      notes?: string | null;
      due_date?: string | null;
      status?: BacklogStatus;
    };
    const updated = backlogItemModel.update(id, patch);
    if (!updated) return next(new HttpError(404, 'Backlog item not found'));
    res.json(updated);
  },
);

backlogItemsRouter.post(
  '/:id/complete',
  validateParams(BacklogItemParamsSchema),
  (req, res, next) => {
    const { id } = req.validatedParams as { id: number };
    const updated = backlogItemModel.complete(id);
    if (!updated) return next(new HttpError(404, 'Backlog item not found'));
    res.json(updated);
  },
);

backlogItemsRouter.delete(
  '/:id',
  validateParams(BacklogItemParamsSchema),
  (req, res, next) => {
    const { id } = req.validatedParams as { id: number };
    const removed = backlogItemModel.remove(id);
    if (!removed) return next(new HttpError(404, 'Backlog item not found'));
    res.status(204).end();
  },
);
