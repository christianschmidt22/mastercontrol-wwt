import { Router } from 'express';
import { taskModel } from '../models/task.model.js';
import { TaskCreateSchema, TaskUpdateSchema, TaskListQuerySchema } from '../schemas/task.schema.js';
import { validateBody, validateQuery } from '../lib/validate.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { TaskStatus } from '../models/task.model.js';

export const tasksRouter = Router();

// GET /?status=&due_before=&org_id=
tasksRouter.get('/', validateQuery(TaskListQuerySchema), (req, res) => {
  const q = req.validated as { status?: TaskStatus; due_before?: string; org_id?: number; project_id?: number };
  const tasks = taskModel.list({
    status: q.status,
    due_before: q.due_before,
    org_id: q.org_id,
    project_id: q.project_id,
  });
  res.json(tasks);
});

// POST /
tasksRouter.post('/', validateBody(TaskCreateSchema), (req, res) => {
  const input = req.validated as {
    title: string;
    organization_id?: number | null;
    contact_id?: number | null;
    project_id?: number | null;
    due_date?: string | null;
    status?: TaskStatus;
  };
  const task = taskModel.create(input);
  res.status(201).json(task);
});

// PUT /:id
tasksRouter.put('/:id', validateBody(TaskUpdateSchema), (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const patch = req.validated as {
    title?: string;
    organization_id?: number | null;
    contact_id?: number | null;
    project_id?: number | null;
    due_date?: string | null;
    status?: TaskStatus;
  };
  const updated = taskModel.update(id, patch);
  if (!updated) return next(new HttpError(404, 'Task not found'));
  res.json(updated);
});

// POST /:id/complete
tasksRouter.post('/:id/complete', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const task = taskModel.complete(id);
  if (!task) return next(new HttpError(404, 'Task not found'));
  res.json(task);
});

// DELETE /:id
tasksRouter.delete('/:id', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Invalid id'));
  const removed = taskModel.remove(id);
  if (!removed) return next(new HttpError(404, 'Task not found'));
  res.status(204).end();
});
