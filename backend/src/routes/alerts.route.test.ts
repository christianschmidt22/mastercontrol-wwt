import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Express } from 'express';
import { alertsRouter } from './alerts.route.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { systemAlertModel } from '../models/systemAlert.model.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/alerts', alertsRouter);
  app.use(errorHandler);
});

describe('alerts route', () => {
  it('lists only unread unresolved alerts for the active bell view', async () => {
    const active = systemAlertModel.create('warn', 'noteExtraction', 'Active alert');
    const read = systemAlertModel.create('warn', 'noteExtraction', 'Read alert');
    const resolved = systemAlertModel.create('error', 'calendarSync', 'Resolved alert');
    systemAlertModel.markRead(read.id);
    systemAlertModel.resolve(resolved.id);

    const res = await request(app).get('/api/alerts?status=active');

    expect(res.status).toBe(200);
    expect((res.body as { unread_count: number }).unread_count).toBe(1);
    const messages = (res.body as { alerts: Array<{ message: string }> }).alerts.map((a) => a.message);
    expect(messages).toContain(active.message);
    expect(messages).not.toContain(read.message);
    expect(messages).not.toContain(resolved.message);
  });

  it('resolves and reopens an alert', async () => {
    const alert = systemAlertModel.create('error', 'calendarSync', 'Calendar failed');

    const resolved = await request(app).post(`/api/alerts/${alert.id}/resolve`);
    expect(resolved.status).toBe(200);

    const resolvedList = await request(app).get('/api/alerts?status=resolved');
    expect(
      (resolvedList.body as { alerts: Array<{ id: number; resolved_at: string | null }> }).alerts
        .find((item) => item.id === alert.id)?.resolved_at,
    ).not.toBeNull();

    const reopened = await request(app).post(`/api/alerts/${alert.id}/unresolve`);
    expect(reopened.status).toBe(200);

    const unresolvedList = await request(app).get('/api/alerts?status=unresolved');
    expect(
      (unresolvedList.body as { alerts: Array<{ id: number; resolved_at: string | null }> }).alerts
        .find((item) => item.id === alert.id)?.resolved_at,
    ).toBeNull();
  });
});
