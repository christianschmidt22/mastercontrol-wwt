import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { db } from '../db/database.js';
import { buildApp } from '../test/app.js';
import { makeOrg, makeNote } from '../test/factories.js';
import { noteModel } from '../models/note.model.js';

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

// ---------------------------------------------------------------------------
// POST /api/notes
// ---------------------------------------------------------------------------

describe('POST /api/notes', () => {
  it('creates a user note with role=user and confirmed=true', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id, content: 'Had a great call today.' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      organization_id: org.id,
      content: 'Had a great call today.',
      role: 'user',
      confirmed: true,
    });
    expect(res.body.id).toBeTypeOf('number');
  });

  it('allows specifying a different role', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id, content: 'Imported note', role: 'imported' });

    expect(res.status).toBe(201);
    expect((res.body as { role: string }).role).toBe('imported');
  });

  it('rejects missing content with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id });

    expect(res.status).toBe(400);
  });

  it('rejects empty content with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id, content: '' });

    expect(res.status).toBe(400);
  });

  it('rejects missing organization_id with 400', async () => {
    const res = await request(app)
      .post('/api/notes')
      .send({ content: 'No org' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid role with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id, content: 'Bad role', role: 'system_hack' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/notes/:id/confirm  (R-002)
// ---------------------------------------------------------------------------

describe('POST /api/notes/:id/confirm', () => {
  it('sets confirmed=1 on an agent_insight note', async () => {
    const org = makeOrg();

    // Create an unconfirmed insight via the model
    const insight = noteModel.createInsight(org.id, 'Agent learned something.', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    // Should start as unconfirmed
    expect(insight.confirmed).toBe(false);

    const res = await request(app).post(`/api/notes/${insight.id}/confirm`);
    expect(res.status).toBe(200);

    // Verify in DB
    const row = db
      .prepare<[number], { confirmed: number }>('SELECT confirmed FROM notes WHERE id = ?')
      .get(insight.id);
    expect(row?.confirmed).toBe(1);
  });

  it('returns 404 for unknown note id', async () => {
    const res = await request(app).post('/api/notes/9999999/confirm');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/notes/:id  (hard delete; also serves as "reject" semantic)
// ---------------------------------------------------------------------------

describe('DELETE /api/notes/:id', () => {
  it('hard-deletes a note and returns 204', async () => {
    const org = makeOrg();
    const note = makeNote(org.id, { content: 'Delete me' });

    const res = await request(app).delete(`/api/notes/${note.id}`);
    expect(res.status).toBe(204);

    // Verify row is gone
    const row = db
      .prepare<[number], { id: number }>('SELECT id FROM notes WHERE id = ?')
      .get(note.id);
    expect(row).toBeUndefined();
  });

  it('serves as reject: deletes an agent_insight note', async () => {
    const org = makeOrg();
    const insight = noteModel.createInsight(org.id, 'Reject this insight.', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const res = await request(app).delete(`/api/notes/${insight.id}`);
    expect(res.status).toBe(204);

    const row = db
      .prepare<[number], { id: number }>('SELECT id FROM notes WHERE id = ?')
      .get(insight.id);
    expect(row).toBeUndefined();
  });

  it('returns 404 for unknown note id', async () => {
    const res = await request(app).delete('/api/notes/9999999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Notes feed inclusion/exclusion via GET /api/organizations/:id/notes
// ---------------------------------------------------------------------------

describe('notes — unconfirmed filtering via org notes endpoint', () => {
  it('confirmed user note is always visible', async () => {
    const org = makeOrg();
    makeNote(org.id, { content: 'Always visible', role: 'user' });

    const res = await request(app).get(
      `/api/organizations/${org.id}/notes?include_unconfirmed=false`,
    );
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).toContain('Always visible');
  });

  it('unconfirmed insight is excluded when include_unconfirmed=false', async () => {
    const org = makeOrg();
    noteModel.createInsight(org.id, 'Hidden insight', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const res = await request(app).get(
      `/api/organizations/${org.id}/notes?include_unconfirmed=false`,
    );
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).not.toContain('Hidden insight');
  });

  it('confirmed insight is visible even with include_unconfirmed=false', async () => {
    const org = makeOrg();
    const insight = noteModel.createInsight(org.id, 'Confirmed insight content', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });
    noteModel.confirm(insight.id);

    const res = await request(app).get(
      `/api/organizations/${org.id}/notes?include_unconfirmed=false`,
    );
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).toContain('Confirmed insight content');
  });
});
