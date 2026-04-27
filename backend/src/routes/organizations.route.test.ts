import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { db } from '../db/database.js';
import { buildApp } from '../test/app.js';
import { makeOrg, makeContact, makeProject, makeDocument, makeNote } from '../test/factories.js';
import { noteModel } from '../models/note.model.js';

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

// ---------------------------------------------------------------------------
// CRUD round-trip
// ---------------------------------------------------------------------------

describe('GET /api/organizations', () => {
  it('filters by type=customer', async () => {
    makeOrg({ type: 'customer', name: 'Cust Only' });
    makeOrg({ type: 'oem', name: 'OEM Only' });

    const res = await request(app).get('/api/organizations?type=customer');
    expect(res.status).toBe(200);
    const bodies = res.body as Array<{ type: string; name: string }>;
    expect(bodies.every((o) => o.type === 'customer')).toBe(true);
    const names = bodies.map((o) => o.name);
    expect(names).toContain('Cust Only');
    expect(names).not.toContain('OEM Only');
  });

  it('filters by type=oem', async () => {
    makeOrg({ type: 'customer', name: 'Cust Skip' });
    makeOrg({ type: 'oem', name: 'OEM Show' });

    const res = await request(app).get('/api/organizations?type=oem');
    expect(res.status).toBe(200);
    const bodies = res.body as Array<{ type: string }>;
    expect(bodies.every((o) => o.type === 'oem')).toBe(true);
  });

  it('rejects unknown type value with 400', async () => {
    const res = await request(app).get('/api/organizations?type=agent');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/organizations', () => {
  it('creates a new organization and returns it', async () => {
    const res = await request(app)
      .post('/api/organizations')
      .send({ type: 'customer', name: 'New Customer', metadata: { tier: 'gold' } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'customer', name: 'New Customer' });
    expect(res.body.id).toBeTypeOf('number');
    expect(res.body.metadata).toMatchObject({ tier: 'gold' });
  });

  it('rejects a bad type with 400', async () => {
    const res = await request(app)
      .post('/api/organizations')
      .send({ type: 'invalid', name: 'Bad Type' });
    expect(res.status).toBe(400);
  });

  it('rejects missing name with 400', async () => {
    const res = await request(app)
      .post('/api/organizations')
      .send({ type: 'customer' });
    expect(res.status).toBe(400);
  });

  it('rejects empty name with 400', async () => {
    const res = await request(app)
      .post('/api/organizations')
      .send({ type: 'oem', name: '' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/organizations/:id', () => {
  it('returns the organization by id', async () => {
    const org = makeOrg({ name: 'Find Me', type: 'oem' });

    const res = await request(app).get(`/api/organizations/${org.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: org.id, name: 'Find Me', type: 'oem' });
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/organizations/9999999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/organizations/:id', () => {
  it('updates name and metadata', async () => {
    const org = makeOrg({ name: 'Old Name' });

    const res = await request(app)
      .put(`/api/organizations/${org.id}`)
      .send({ name: 'New Name', metadata: { updated: true } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: org.id, name: 'New Name' });
    expect(res.body.metadata).toMatchObject({ updated: true });
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/organizations/9999999')
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('rejects invalid type in body with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .put(`/api/organizations/${org.id}`)
      .send({ type: 'invalid_type' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/organizations/:id', () => {
  it('deletes an organization and returns 204', async () => {
    const org = makeOrg();

    const res = await request(app).delete(`/api/organizations/${org.id}`);
    expect(res.status).toBe(204);

    const check = await request(app).get(`/api/organizations/${org.id}`);
    expect(check.status).toBe(404);
  });

  it('returns 404 when deleting a non-existent org', async () => {
    const res = await request(app).delete('/api/organizations/9999999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Cascade delete
// ---------------------------------------------------------------------------

describe('DELETE /api/organizations/:id — cascade', () => {
  it('cascade-deletes contacts, projects, documents, and notes', async () => {
    const org = makeOrg({ name: 'Cascade Org' });

    makeContact(org.id, { name: 'Cascade Contact' });
    makeProject(org.id, { name: 'Cascade Project' });
    makeDocument(org.id, { label: 'Cascade Doc', url_or_path: 'https://example.com' });
    makeNote(org.id, { content: 'Cascade note' });

    // Verify children exist before delete
    const beforeContacts = db
      .prepare<[number], { n: number }>('SELECT COUNT(*) AS n FROM contacts WHERE organization_id = ?')
      .get(org.id)!;
    expect(beforeContacts.n).toBe(1);

    await request(app).delete(`/api/organizations/${org.id}`);

    const afterContacts = db
      .prepare<[number], { n: number }>('SELECT COUNT(*) AS n FROM contacts WHERE organization_id = ?')
      .get(org.id)!;
    const afterProjects = db
      .prepare<[number], { n: number }>('SELECT COUNT(*) AS n FROM projects WHERE organization_id = ?')
      .get(org.id)!;
    const afterDocuments = db
      .prepare<[number], { n: number }>('SELECT COUNT(*) AS n FROM documents WHERE organization_id = ?')
      .get(org.id)!;
    const afterNotes = db
      .prepare<[number], { n: number }>('SELECT COUNT(*) AS n FROM notes WHERE organization_id = ?')
      .get(org.id)!;

    expect(afterContacts.n).toBe(0);
    expect(afterProjects.n).toBe(0);
    expect(afterDocuments.n).toBe(0);
    expect(afterNotes.n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Nested helpers
// ---------------------------------------------------------------------------

describe('GET /api/organizations/:id/contacts', () => {
  it('returns only contacts for the specified org', async () => {
    const org1 = makeOrg({ name: 'Org One' });
    const org2 = makeOrg({ name: 'Org Two' });

    makeContact(org1.id, { name: 'Alice' });
    makeContact(org1.id, { name: 'Bob' });
    makeContact(org2.id, { name: 'Carol' });

    const res = await request(app).get(`/api/organizations/${org1.id}/contacts`);
    expect(res.status).toBe(200);
    const names = (res.body as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
    expect(names).not.toContain('Carol');
  });

  it('returns 404 for unknown org', async () => {
    const res = await request(app).get('/api/organizations/9999999/contacts');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/organizations/:id/projects', () => {
  it('returns only projects for the specified org', async () => {
    const org1 = makeOrg();
    const org2 = makeOrg();

    makeProject(org1.id, { name: 'Alpha Project' });
    makeProject(org2.id, { name: 'Beta Project' });

    const res = await request(app).get(`/api/organizations/${org1.id}/projects`);
    expect(res.status).toBe(200);
    const names = (res.body as Array<{ name: string }>).map((p) => p.name);
    expect(names).toContain('Alpha Project');
    expect(names).not.toContain('Beta Project');
  });
});

describe('GET /api/organizations/:id/documents', () => {
  it('returns only documents for the specified org', async () => {
    const org1 = makeOrg();
    const org2 = makeOrg();

    makeDocument(org1.id, { label: 'Org1 Doc' });
    makeDocument(org2.id, { label: 'Org2 Doc' });

    const res = await request(app).get(`/api/organizations/${org1.id}/documents`);
    expect(res.status).toBe(200);
    const labels = (res.body as Array<{ label: string }>).map((d) => d.label);
    expect(labels).toContain('Org1 Doc');
    expect(labels).not.toContain('Org2 Doc');
  });
});

describe('GET /api/organizations/:id/notes', () => {
  it('returns only notes for the specified org', async () => {
    const org1 = makeOrg();
    const org2 = makeOrg();

    makeNote(org1.id, { content: 'Note for org1' });
    makeNote(org2.id, { content: 'Note for org2' });

    const res = await request(app).get(`/api/organizations/${org1.id}/notes`);
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).toContain('Note for org1');
    expect(contents).not.toContain('Note for org2');
  });

  it('excludes unconfirmed agent_insight notes when include_unconfirmed=false', async () => {
    const org = makeOrg();

    // A confirmed user note
    makeNote(org.id, { content: 'Confirmed user note', role: 'user' });

    // An unconfirmed agent_insight (confirmed=0 is set by noteModel.createInsight)
    noteModel.createInsight(org.id, 'Unconfirmed insight text', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const res = await request(app).get(
      `/api/organizations/${org.id}/notes?include_unconfirmed=false`,
    );
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).toContain('Confirmed user note');
    expect(contents).not.toContain('Unconfirmed insight text');
  });

  it('includes unconfirmed agent_insight notes by default (include_unconfirmed=true)', async () => {
    const org = makeOrg();

    makeNote(org.id, { content: 'Regular note' });
    noteModel.createInsight(org.id, 'Unconfirmed insight visible', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const res = await request(app).get(`/api/organizations/${org.id}/notes`);
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).toContain('Unconfirmed insight visible');
  });

  it('respects ?limit= parameter', async () => {
    const org = makeOrg();

    for (let i = 0; i < 5; i++) {
      makeNote(org.id, { content: `Note ${i}` });
    }

    const res = await request(app).get(`/api/organizations/${org.id}/notes?limit=2`);
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// GET /api/organizations/recent
// ---------------------------------------------------------------------------

describe('GET /api/organizations/recent', () => {
  it('returns all orgs with id, name, type, and last_touched fields', async () => {
    const org = makeOrg({ name: 'Recent Org Beta', type: 'oem' });

    const res = await request(app).get('/api/organizations/recent');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const found = (
      res.body as Array<{ id: number; name: string; type: string; last_touched: string }>
    ).find((o) => o.id === org.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Recent Org Beta');
    expect(found!.type).toBe('oem');
    expect(found!.last_touched).toBeTruthy();
  });

  it('last_touched advances when a note is added', async () => {
    const org = makeOrg({ name: 'Touch Org' });
    makeNote(org.id, { content: 'Touch this org via note' });

    const res = await request(app).get('/api/organizations/recent');
    expect(res.status).toBe(200);

    const found = (res.body as Array<{ id: number; last_touched: string }>)
      .find((o) => o.id === org.id);
    expect(found).toBeDefined();
    // Should NOT be the epoch default since a note exists
    expect(found!.last_touched.startsWith('1970')).toBe(false);
  });

  it('respects ?limit= parameter', async () => {
    for (let i = 0; i < 5; i++) makeOrg();

    const res = await request(app).get('/api/organizations/recent?limit=2');
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBeLessThanOrEqual(2);
  });

  it('rejects limit > 100 with 400', async () => {
    const res = await request(app).get('/api/organizations/recent?limit=101');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Full CRUD round-trip (create → list → get → update → delete)
// ---------------------------------------------------------------------------

describe('organizations — full round-trip', () => {
  it('create → list → get → update → delete', async () => {
    // Create
    const createRes = await request(app)
      .post('/api/organizations')
      .send({ type: 'customer', name: 'Round Trip Corp', metadata: { region: 'east' } });
    expect(createRes.status).toBe(201);
    const id: number = (createRes.body as { id: number }).id;

    // List — should include the new org
    const listRes = await request(app).get('/api/organizations?type=customer');
    expect(listRes.status).toBe(200);
    const ids = (listRes.body as Array<{ id: number }>).map((o) => o.id);
    expect(ids).toContain(id);

    // Get
    const getRes = await request(app).get(`/api/organizations/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toMatchObject({ id, name: 'Round Trip Corp' });

    // Update
    const putRes = await request(app)
      .put(`/api/organizations/${id}`)
      .send({ name: 'Updated Corp' });
    expect(putRes.status).toBe(200);
    expect(putRes.body).toMatchObject({ name: 'Updated Corp' });

    // Delete
    const delRes = await request(app).delete(`/api/organizations/${id}`);
    expect(delRes.status).toBe(204);

    // Confirm gone
    const goneRes = await request(app).get(`/api/organizations/${id}`);
    expect(goneRes.status).toBe(404);
  });
});
