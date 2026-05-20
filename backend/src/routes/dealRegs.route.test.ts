import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../test/app.js';

describe('deal regs route', () => {
  it('creates, lists, updates, and deletes deal registrations', async () => {
    const app = await buildApp();

    const created = await request(app)
      .post('/api/deal-regs')
      .send({
        vendor: 'Cisco',
        customer: 'C.H. Robinson',
        deal_reg_number: 'DR-12345',
        project: 'Data center refresh',
        notes: 'Initial partner registration.',
      });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      vendor: 'Cisco',
      customer: 'C.H. Robinson',
      deal_reg_number: 'DR-12345',
      project: 'Data center refresh',
      notes: 'Initial partner registration.',
    });

    const listed = await request(app).get('/api/deal-regs');
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);

    const updated = await request(app)
      .put(`/api/deal-regs/${created.body.id}`)
      .send({
        vendor: 'Cisco',
        customer: 'C.H. Robinson',
        deal_reg_number: 'DR-12345',
        project: 'Data center refresh',
        notes: 'Renewal notes added.',
      });

    expect(updated.status).toBe(200);
    expect(updated.body.notes).toBe('Renewal notes added.');

    const deleted = await request(app).delete(`/api/deal-regs/${created.body.id}`);
    expect(deleted.status).toBe(204);

    const listedAfterDelete = await request(app).get('/api/deal-regs');
    expect(listedAfterDelete.body).toHaveLength(0);
  });
});
