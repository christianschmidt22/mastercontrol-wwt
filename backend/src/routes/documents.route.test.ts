import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../test/app.js';
import { makeOrg, makeDocument } from '../test/factories.js';

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

// ---------------------------------------------------------------------------
// POST /api/documents
// ---------------------------------------------------------------------------

describe('POST /api/documents', () => {
  it('creates a link document and returns 201', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/documents')
      .send({
        organization_id: org.id,
        kind: 'link',
        label: 'Product Roadmap',
        url_or_path: 'https://confluence.example.com/roadmap',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      organization_id: org.id,
      kind: 'link',
      label: 'Product Roadmap',
      url_or_path: 'https://confluence.example.com/roadmap',
      source: 'manual',
    });
    expect(res.body.id).toBeTypeOf('number');
  });

  it('creates a file document and returns 201', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/documents')
      .send({
        organization_id: org.id,
        kind: 'file',
        label: 'Statement of Work',
        url_or_path: 'C:\\Documents\\sow.pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'file', label: 'Statement of Work' });
  });

  it('defaults source to manual', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/documents')
      .send({ organization_id: org.id, kind: 'link', label: 'Test', url_or_path: 'https://x.com' });

    expect(res.status).toBe(201);
    expect((res.body as { source: string }).source).toBe('manual');
  });

  it('accepts source=onedrive_scan', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/documents')
      .send({
        organization_id: org.id,
        kind: 'file',
        label: 'Scanned Doc',
        url_or_path: 'C:\\OneDrive\\file.pdf',
        source: 'onedrive_scan',
      });

    expect(res.status).toBe(201);
    expect((res.body as { source: string }).source).toBe('onedrive_scan');
  });

  it('rejects invalid kind with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/documents')
      .send({ organization_id: org.id, kind: 'pdf', label: 'Bad Kind', url_or_path: 'https://x.com' });

    expect(res.status).toBe(400);
  });

  it('rejects missing label with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/documents')
      .send({ organization_id: org.id, kind: 'link', url_or_path: 'https://x.com' });

    expect(res.status).toBe(400);
  });

  it('rejects missing organization_id with 400', async () => {
    const res = await request(app)
      .post('/api/documents')
      .send({ kind: 'link', label: 'No Org', url_or_path: 'https://x.com' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/documents/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/documents/:id', () => {
  it('deletes a document and returns 204', async () => {
    const org = makeOrg();
    const doc = makeDocument(org.id, { label: 'To Delete' });

    const res = await request(app).delete(`/api/documents/${doc.id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/documents/9999999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Full round-trip
// ---------------------------------------------------------------------------

describe('documents — full round-trip', () => {
  it('create → delete', async () => {
    const org = makeOrg();

    const createRes = await request(app)
      .post('/api/documents')
      .send({ organization_id: org.id, kind: 'link', label: 'RT Doc', url_or_path: 'https://example.com' });
    expect(createRes.status).toBe(201);
    const id: number = (createRes.body as { id: number }).id;

    const delRes = await request(app).delete(`/api/documents/${id}`);
    expect(delRes.status).toBe(204);
  });
});
