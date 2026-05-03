import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Express } from 'express';
import { db } from '../db/database.js';
import { makeOrg, makeTask } from '../test/factories.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { tasksRouter } from './tasks.route.js';

let app: Express;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/tasks', tasksRouter);
  app.use(errorHandler);
});

// ---------------------------------------------------------------------------
// POST /api/tasks
// ---------------------------------------------------------------------------

describe('POST /api/tasks', () => {
  it('creates a task with all fields and returns 201', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Email Sarah about renewal',
        organization_id: org.id,
        details: 'Ask whether security review has a named owner.',
        kind: 'task',
        due_date: '2026-05-01',
        status: 'open',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Email Sarah about renewal',
      organization_id: org.id,
      details: 'Ask whether security review has a named owner.',
      kind: 'task',
      due_date: '2026-05-01',
      status: 'open',
    });
    expect(res.body.id).toBeTypeOf('number');
  });

  it('creates a task with no org (standalone task)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Personal task' });

    expect(res.status).toBe(201);
    expect((res.body as { organization_id: number | null }).organization_id).toBeNull();
  });

  it('defaults status to open', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'No status given' });

    expect(res.status).toBe(201);
    expect((res.body as { status: string }).status).toBe('open');
  });

  it('rejects missing title with 400', async () => {
    const res = await request(app).post('/api/tasks').send({});
    expect(res.status).toBe(400);
  });

  it('rejects empty title with 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid status with 400', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Bad status', status: 'flying' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tasks with filters
// ---------------------------------------------------------------------------

describe('GET /api/tasks', () => {
  it('returns all tasks when no filter', async () => {
    makeTask({ title: 'Task A', status: 'open' });
    makeTask({ title: 'Task B', status: 'done' });

    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    const titles = (res.body as Array<{ title: string }>).map((t) => t.title);
    expect(titles).toContain('Task A');
    expect(titles).toContain('Task B');
  });

  it('filters by status=open', async () => {
    makeTask({ title: 'Open Task', status: 'open' });
    makeTask({ title: 'Done Task', status: 'done' });

    const res = await request(app).get('/api/tasks?status=open');
    expect(res.status).toBe(200);
    const bodies = res.body as Array<{ status: string; title: string }>;
    expect(bodies.every((t) => t.status === 'open')).toBe(true);
    const titles = bodies.map((t) => t.title);
    expect(titles).toContain('Open Task');
    expect(titles).not.toContain('Done Task');
  });

  it('filters by status=done', async () => {
    makeTask({ title: 'Should Show', status: 'done' });
    makeTask({ title: 'Should Hide', status: 'open' });

    const res = await request(app).get('/api/tasks?status=done');
    expect(res.status).toBe(200);
    const bodies = res.body as Array<{ status: string }>;
    expect(bodies.every((t) => t.status === 'done')).toBe(true);
  });

  it('filters by due_before', async () => {
    makeTask({ title: 'Overdue Task', due_date: '2026-01-01' });
    makeTask({ title: 'Future Task', due_date: '2030-12-31' });

    const res = await request(app).get('/api/tasks?due_before=2026-06-01');
    expect(res.status).toBe(200);
    const titles = (res.body as Array<{ title: string }>).map((t) => t.title);
    expect(titles).toContain('Overdue Task');
    expect(titles).not.toContain('Future Task');
  });

  it('filters by org_id', async () => {
    const org1 = makeOrg();
    const org2 = makeOrg();

    makeTask({ title: 'Org1 Task', organization_id: org1.id });
    makeTask({ title: 'Org2 Task', organization_id: org2.id });

    const res = await request(app).get(`/api/tasks?org_id=${org1.id}`);
    expect(res.status).toBe(200);
    const titles = (res.body as Array<{ title: string }>).map((t) => t.title);
    expect(titles).toContain('Org1 Task');
    expect(titles).not.toContain('Org2 Task');
  });

  it('combines multiple filters', async () => {
    const org = makeOrg();

    makeTask({ title: 'Match', organization_id: org.id, status: 'open', due_date: '2026-03-01' });
    makeTask({ title: 'Wrong Status', organization_id: org.id, status: 'done', due_date: '2026-03-01' });
    makeTask({ title: 'Wrong Org', status: 'open', due_date: '2026-03-01' });

    const res = await request(app).get(`/api/tasks?status=open&org_id=${org.id}`);
    expect(res.status).toBe(200);
    const titles = (res.body as Array<{ title: string }>).map((t) => t.title);
    expect(titles).toContain('Match');
    expect(titles).not.toContain('Wrong Status');
    expect(titles).not.toContain('Wrong Org');
  });

  it('rejects invalid status query param with 400', async () => {
    const res = await request(app).get('/api/tasks?status=invalid_status');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/tasks/:id
// ---------------------------------------------------------------------------

describe('PUT /api/tasks/:id', () => {
  it('updates title, details, and due_date', async () => {
    const task = makeTask({ title: 'Old Title', due_date: '2026-04-01' });

    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({ title: 'New Title', details: 'Working notes for the task', due_date: '2026-06-01' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: task.id,
      title: 'New Title',
      details: 'Working notes for the task',
      due_date: '2026-06-01',
    });
  });

  it('filters remembered questions separately from normal tasks', async () => {
    makeTask({ title: 'Normal Task', kind: 'task', status: 'open' });
    makeTask({ title: 'Question Task', kind: 'question', status: 'open' });

    const res = await request(app).get('/api/tasks?kind=question');

    expect(res.status).toBe(200);
    const titles = (res.body as Array<{ title: string; kind: string }>).map((t) => t.title);
    expect(titles).toContain('Question Task');
    expect(titles).not.toContain('Normal Task');
    expect((res.body as Array<{ kind: string }>).every((t) => t.kind === 'question')).toBe(true);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/tasks/9999999')
      .send({ title: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('rejects invalid status with 400', async () => {
    const task = makeTask();

    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({ status: 'bad_value' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/complete
// ---------------------------------------------------------------------------

describe('POST /api/tasks/:id/complete', () => {
  it('sets status=done and stamps completed_at', async () => {
    const task = makeTask({ title: 'Complete Me', status: 'open' });

    const res = await request(app).post(`/api/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe('done');

    // Verify completed_at is set in the DB
    const row = db
      .prepare<[number], { status: string; completed_at: string | null }>(
        'SELECT status, completed_at FROM tasks WHERE id = ?',
      )
      .get(task.id);

    expect(row?.status).toBe('done');
    expect(row?.completed_at).not.toBeNull();
  });

  it('is idempotent — completing a done task still returns 200', async () => {
    const task = makeTask({ title: 'Already Done', status: 'done' });

    const res = await request(app).post(`/api/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe('done');
  });

  it('returns 404 for unknown task id', async () => {
    const res = await request(app).post('/api/tasks/9999999/complete');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/tasks/:id', () => {
  it('deletes a task and returns 204', async () => {
    const task = makeTask();

    const res = await request(app).delete(`/api/tasks/${task.id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/tasks/9999999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Full round-trip
// ---------------------------------------------------------------------------

describe('tasks — full round-trip', () => {
  it('create → update → complete → delete', async () => {
    const org = makeOrg();

    const createRes = await request(app)
      .post('/api/tasks')
      .send({ title: 'RT Task', organization_id: org.id, due_date: '2026-07-01' });
    expect(createRes.status).toBe(201);
    const id: number = (createRes.body as { id: number }).id;

    const putRes = await request(app)
      .put(`/api/tasks/${id}`)
      .send({ title: 'RT Task Updated' });
    expect(putRes.status).toBe(200);

    const completeRes = await request(app).post(`/api/tasks/${id}/complete`);
    expect(completeRes.status).toBe(200);
    expect((completeRes.body as { status: string }).status).toBe('done');

    const delRes = await request(app).delete(`/api/tasks/${id}`);
    expect(delRes.status).toBe(204);
  });
});
