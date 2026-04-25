import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../test/app.js';
import { makeOrg, makeProject } from '../test/factories.js';

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

// ---------------------------------------------------------------------------
// POST /api/projects
// ---------------------------------------------------------------------------

describe('POST /api/projects', () => {
  it('creates a project and returns 201', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/projects')
      .send({
        organization_id: org.id,
        name: 'Network Refresh',
        status: 'active',
        description: 'Full campus upgrade',
        doc_url: 'https://sharepoint.example.com/doc',
        notes_url: 'https://onenote.example.com/notes',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      organization_id: org.id,
      name: 'Network Refresh',
      status: 'active',
      description: 'Full campus upgrade',
    });
    expect(res.body.id).toBeTypeOf('number');
  });

  it('defaults status to active when omitted', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/projects')
      .send({ organization_id: org.id, name: 'Minimal Project' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'active' });
  });

  it('accepts all valid status values', async () => {
    const org = makeOrg();
    const statuses = ['active', 'qualifying', 'won', 'lost', 'paused', 'closed'] as const;

    for (const status of statuses) {
      const res = await request(app)
        .post('/api/projects')
        .send({ organization_id: org.id, name: `${status} Project`, status });
      expect(res.status).toBe(201);
      expect((res.body as { status: string }).status).toBe(status);
    }
  });

  it('rejects invalid status with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/projects')
      .send({ organization_id: org.id, name: 'Bad Status', status: 'flying' });

    expect(res.status).toBe(400);
  });

  it('rejects missing name with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/projects')
      .send({ organization_id: org.id });

    expect(res.status).toBe(400);
  });

  it('rejects missing organization_id with 400', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'No Org' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/projects/:id
// ---------------------------------------------------------------------------

describe('PUT /api/projects/:id', () => {
  it('updates a project', async () => {
    const org = makeOrg();
    const project = makeProject(org.id, { name: 'Old Name', status: 'qualifying' });

    const res = await request(app)
      .put(`/api/projects/${project.id}`)
      .send({ name: 'Updated Name', status: 'won' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: project.id, name: 'Updated Name', status: 'won' });
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/projects/9999999')
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('rejects invalid status in update with 400', async () => {
    const org = makeOrg();
    const project = makeProject(org.id);

    const res = await request(app)
      .put(`/api/projects/${project.id}`)
      .send({ status: 'not_valid' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/projects/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/projects/:id', () => {
  it('deletes a project and returns 204', async () => {
    const org = makeOrg();
    const project = makeProject(org.id);

    const res = await request(app).delete(`/api/projects/${project.id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/projects/9999999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Full round-trip
// ---------------------------------------------------------------------------

describe('projects — full round-trip', () => {
  it('create → update → delete', async () => {
    const org = makeOrg();

    const createRes = await request(app)
      .post('/api/projects')
      .send({ organization_id: org.id, name: 'Round Trip Project' });
    expect(createRes.status).toBe(201);
    const id: number = (createRes.body as { id: number }).id;

    const putRes = await request(app)
      .put(`/api/projects/${id}`)
      .send({ name: 'Renamed Project', status: 'paused' });
    expect(putRes.status).toBe(200);

    const delRes = await request(app).delete(`/api/projects/${id}`);
    expect(delRes.status).toBe(204);
  });
});
