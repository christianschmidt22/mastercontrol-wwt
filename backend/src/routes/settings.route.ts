import { Router } from 'express';
import { settingsModel } from '../models/settings.model.js';
import { SettingsSetSchema } from '../schemas/settings.schema.js';
import { validateBody } from '../lib/validate.js';
import { HttpError } from '../middleware/errorHandler.js';

export const settingsRouter = Router();

// GET /:key — returns masked value for secrets
settingsRouter.get('/:key', (req, res, next) => {
  const { key } = req.params;
  if (!key || key.trim() === '') return next(new HttpError(400, 'Invalid key'));
  const value = settingsModel.getMasked(key);
  if (value === null) return next(new HttpError(404, 'Setting not found'));
  res.json({ key, value });
});

// PUT / — set a setting, return masked form
settingsRouter.put('/', validateBody(SettingsSetSchema), (req, res) => {
  const { key, value } = req.validated as { key: string; value: string };
  settingsModel.set(key, value);
  const masked = settingsModel.getMasked(key);
  res.json({ key, value: masked });
});

// DELETE /:key — remove a setting (used by tile-layout reset flow)
settingsRouter.delete('/:key', (req, res, next) => {
  const { key } = req.params;
  if (!key || key.trim() === '') return next(new HttpError(400, 'Invalid key'));
  const removed = settingsModel.remove(key);
  if (!removed) return next(new HttpError(404, 'Setting not found'));
  res.status(204).end();
});
