import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../test/app.js';
import { makeOrg, makeContact } from '../test/factories.js';

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

// ---------------------------------------------------------------------------
// POST /api/contacts
// ---------------------------------------------------------------------------

describe('POST /api/contacts', () => {
  it('creates a contact and returns 201', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/contacts')
      .send({
        organization_id: org.id,
        name: 'Alice Smith',
        title: 'VP Engineering',
        email: 'alice@example.com',
        phone: '555-1234',
        role: 'account',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      organization_id: org.id,
      name: 'Alice Smith',
      title: 'VP Engineering',
      email: 'alice@example.com',
      phone: '555-1234',
      role: 'account',
    });
    expect(res.body.id).toBeTypeOf('number');
  });

  it('creates a contact with minimal fields', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/contacts')
      .send({ organization_id: org.id, name: 'Bob Jones' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Bob Jones' });
  });

  it('rejects missing name with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/contacts')
      .send({ organization_id: org.id });

    expect(res.status).toBe(400);
  });

  it('rejects missing organization_id with 400', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .send({ name: 'No Org' });

    expect(res.status).toBe(400);
  });

  it('rejects empty name with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/contacts')
      .send({ organization_id: org.id, name: '' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/contacts/:id
// ---------------------------------------------------------------------------

describe('PUT /api/contacts/:id', () => {
  it('updates a contact', async () => {
    const org = makeOrg();
    const contact = makeContact(org.id, { name: 'Old Name', title: 'Old Title' });

    const res = await request(app)
      .put(`/api/contacts/${contact.id}`)
      .send({ name: 'New Name', title: 'New Title' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: contact.id, name: 'New Name', title: 'New Title' });
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/contacts/9999999')
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('rejects empty name with 400', async () => {
    const org = makeOrg();
    const contact = makeContact(org.id);

    const res = await request(app)
      .put(`/api/contacts/${contact.id}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/contacts/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/contacts/:id', () => {
  it('deletes a contact and returns 204', async () => {
    const org = makeOrg();
    const contact = makeContact(org.id);

    const res = await request(app).delete(`/api/contacts/${contact.id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/contacts/9999999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Full CRUD round-trip
// ---------------------------------------------------------------------------

describe('contacts — full round-trip', () => {
  it('create → update → delete', async () => {
    const org = makeOrg();

    // Create
    const createRes = await request(app)
      .post('/api/contacts')
      .send({ organization_id: org.id, name: 'Round Trip Person', email: 'rt@example.com' });
    expect(createRes.status).toBe(201);
    const id: number = (createRes.body as { id: number }).id;

    // Update
    const putRes = await request(app)
      .put(`/api/contacts/${id}`)
      .send({ name: 'Updated Person' });
    expect(putRes.status).toBe(200);
    expect((putRes.body as { name: string }).name).toBe('Updated Person');

    // Delete
    const delRes = await request(app).delete(`/api/contacts/${id}`);
    expect(delRes.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// account assignments (OEM contacts → customer orgs)
// ---------------------------------------------------------------------------

describe('contacts — assigned_org_ids', () => {
  it('creates a contact with no assignments and returns assigned_org_ids = []', async () => {
    const oem = makeOrg({ type: 'oem' });

    const res = await request(app)
      .post('/api/contacts')
      .send({ organization_id: oem.id, name: 'Unassigned Rep' });

    expect(res.status).toBe(201);
    expect(res.body.assigned_org_ids).toEqual([]);
  });

  it('creates an OEM contact with account assignments and returns them', async () => {
    const oem = makeOrg({ type: 'oem' });
    const customer1 = makeOrg({ type: 'customer' });
    const customer2 = makeOrg({ type: 'customer' });

    const res = await request(app)
      .post('/api/contacts')
      .send({
        organization_id: oem.id,
        name: 'Assigned Rep',
        role: 'channel',
        assigned_org_ids: [customer1.id, customer2.id],
      });

    expect(res.status).toBe(201);
    expect(res.body.assigned_org_ids).toHaveLength(2);
    expect(res.body.assigned_org_ids).toContain(customer1.id);
    expect(res.body.assigned_org_ids).toContain(customer2.id);
  });

  it('updates assigned_org_ids via PUT', async () => {
    const oem = makeOrg({ type: 'oem' });
    const customer1 = makeOrg({ type: 'customer' });
    const customer2 = makeOrg({ type: 'customer' });

    const createRes = await request(app)
      .post('/api/contacts')
      .send({
        organization_id: oem.id,
        name: 'Rep To Reassign',
        assigned_org_ids: [customer1.id],
      });
    expect(createRes.status).toBe(201);
    const id: number = (createRes.body as { id: number }).id;

    // Replace assignment with customer2 only
    const putRes = await request(app)
      .put(`/api/contacts/${id}`)
      .send({ assigned_org_ids: [customer2.id] });

    expect(putRes.status).toBe(200);
    expect(putRes.body.assigned_org_ids).toEqual([customer2.id]);
  });

  it('clears all assignments when PUT sends empty array', async () => {
    const oem = makeOrg({ type: 'oem' });
    const customer = makeOrg({ type: 'customer' });

    const createRes = await request(app)
      .post('/api/contacts')
      .send({
        organization_id: oem.id,
        name: 'Rep To Unassign',
        assigned_org_ids: [customer.id],
      });
    const id: number = (createRes.body as { id: number }).id;

    const putRes = await request(app)
      .put(`/api/contacts/${id}`)
      .send({ assigned_org_ids: [] });

    expect(putRes.status).toBe(200);
    expect(putRes.body.assigned_org_ids).toEqual([]);
  });

  it('does not change assignments when PUT omits assigned_org_ids', async () => {
    const oem = makeOrg({ type: 'oem' });
    const customer = makeOrg({ type: 'customer' });

    const createRes = await request(app)
      .post('/api/contacts')
      .send({
        organization_id: oem.id,
        name: 'Stable Assignments Rep',
        assigned_org_ids: [customer.id],
      });
    const id: number = (createRes.body as { id: number }).id;

    // PUT without assigned_org_ids — assignments must be unchanged
    const putRes = await request(app)
      .put(`/api/contacts/${id}`)
      .send({ name: 'Updated Name' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.name).toBe('Updated Name');
    expect(putRes.body.assigned_org_ids).toEqual([customer.id]);
  });
});
