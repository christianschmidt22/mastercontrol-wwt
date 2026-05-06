import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../test/app.js';
import { findFreetime } from '../services/freetime.service.js';

vi.mock('../services/freetime.service.js', () => ({
  findFreetime: vi.fn(),
}));

const mockedFindFreetime = vi.mocked(findFreetime);

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

describe('POST /api/tools/freetime/find', () => {
  it('returns common FreeBusy slots for selected users', async () => {
    mockedFindFreetime.mockResolvedValueOnce({
      participants: [{ email: 'maya.patel@wwt.com', name: 'Maya Patel' }],
      unresolved: [],
      slots: [{
        date: '2026-05-06',
        start_time: '9:00 AM',
        end_time: '10:30 AM',
        start_at: '2026-05-06T09:00:00',
        end_at: '2026-05-06T10:30:00',
        duration_minutes: 90,
      }],
    });

    const res = await request(app)
      .post('/api/tools/freetime/find')
      .send({
        participant_emails: ['maya.patel@wwt.com'],
        include_self: true,
        start_date: '2026-05-05',
        end_date: '2026-05-19',
        weekdays: [1, 2, 3, 4, 5],
        work_start_minutes: 480,
        work_end_minutes: 960,
        minimum_duration_minutes: 60,
      });

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(1);
    expect(mockedFindFreetime).toHaveBeenCalledWith(expect.objectContaining({
      participant_emails: ['maya.patel@wwt.com'],
      include_self: true,
      minimum_duration_minutes: 60,
    }));
  });

  it('rejects requests that exclude self and have no users', async () => {
    const res = await request(app)
      .post('/api/tools/freetime/find')
      .send({
        participant_emails: [],
        include_self: false,
        start_date: '2026-05-05',
        end_date: '2026-05-19',
        weekdays: [1],
        work_start_minutes: 480,
        work_end_minutes: 960,
      });

    expect(res.status).toBe(400);
  });

  it('rejects minimum openings longer than the selected work window', async () => {
    const res = await request(app)
      .post('/api/tools/freetime/find')
      .send({
        participant_emails: ['maya.patel@wwt.com'],
        include_self: true,
        start_date: '2026-05-05',
        end_date: '2026-05-19',
        weekdays: [1],
        work_start_minutes: 480,
        work_end_minutes: 510,
        minimum_duration_minutes: 60,
      });

    expect(res.status).toBe(400);
  });
});
