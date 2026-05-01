import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { HeartbeatConfigSchema, type HeartbeatConfigInput } from '../schemas/heartbeat.schema.js';
import {
  getHeartbeatConfig,
  runHeartbeatOnce,
  saveHeartbeatConfig,
} from '../services/heartbeat.service.js';
import { notifyHeartbeatConfigChanged } from '../services/scheduler.service.js';

export const heartbeatRouter = Router();

heartbeatRouter.get('/config', (_req, res) => {
  res.json(getHeartbeatConfig());
});

heartbeatRouter.put('/config', validateBody(HeartbeatConfigSchema), (req, res) => {
  const config = saveHeartbeatConfig(req.validated as HeartbeatConfigInput);
  notifyHeartbeatConfigChanged();
  res.json(config);
});

heartbeatRouter.post('/run-once', (_req, res, next) => {
  runHeartbeatOnce()
    .then((result) => res.json(result))
    .catch(next);
});
