import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Express } from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

vi.mock('../services/claude.service.js', () => ({
  runCaptureAction: vi.fn(),
}));

import { runCaptureAction } from '../services/claude.service.js';
import { captureActionRouter } from './captureAction.route.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json({ limit: '16mb' }));
  app.use('/api/capture-action', captureActionRouter);
  app.use(errorHandler);
});

beforeEach(() => {
  vi.mocked(runCaptureAction).mockReset();
});

describe('POST /api/capture-action/run', () => {
  it('validates input and returns the created capture actions', async () => {
    vi.mocked(runCaptureAction).mockResolvedValue({
      summary: 'Created a reminder.',
      created_tasks: [
        {
          id: 42,
          title: 'Follow up with Pat',
          details: 'Visible screenshot context',
          organization_id: 2,
          due_date: '2026-05-04',
          status: 'open',
        },
      ],
      created_notes: [],
      model_notes: [],
    });

    const res = await request(app)
      .post('/api/capture-action/run')
      .send({
        prompt: 'Create a reminder from this screenshot',
        organization_id: 2,
        attachments: [
          {
            name: 'text.png',
            mime_type: 'image/png',
            data_base64: Buffer.from('fake').toString('base64'),
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      summary: 'Created a reminder.',
      created_tasks: [{ id: 42, title: 'Follow up with Pat' }],
    });
    expect(runCaptureAction).toHaveBeenCalledWith({
      prompt: 'Create a reminder from this screenshot',
      organization_id: 2,
      attachments: [
        {
          name: 'text.png',
          mime_type: 'image/png',
          data_base64: Buffer.from('fake').toString('base64'),
        },
      ],
    });
  });

  it('rejects requests without an attachment', async () => {
    const res = await request(app)
      .post('/api/capture-action/run')
      .send({
        prompt: 'Do something',
        attachments: [],
      });

    expect(res.status).toBe(400);
    expect(runCaptureAction).not.toHaveBeenCalled();
  });
});
