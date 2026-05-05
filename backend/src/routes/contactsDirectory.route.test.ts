import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../test/app.js';
import { searchWwtDirectory } from '../services/outlookDirectory.service.js';
import { contactModel } from '../models/contact.model.js';

vi.mock('../services/outlookDirectory.service.js', () => ({
  searchWwtDirectory: vi.fn(),
}));

const mockedSearchWwtDirectory = vi.mocked(searchWwtDirectory);

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

describe('WWT directory contacts', () => {
  it('searches the Outlook directory through the service', async () => {
    mockedSearchWwtDirectory.mockResolvedValueOnce([
      {
        name: 'Maya Patel',
        email: 'maya.patel@wwt.com',
        title: 'Security Architect',
        department: 'Security',
        office: 'St. Louis',
        phone: null,
        source: 'Global Address List',
      },
    ]);

    const res = await request(app).get('/api/contacts/directory/search?q=Maya');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ name: 'Maya Patel', email: 'maya.patel@wwt.com' });
  });

  it('imports a confirmed WWT directory result into local contacts', async () => {
    const res = await request(app)
      .post('/api/contacts/directory/import')
      .send({
        name: 'Maya Patel',
        email: 'maya.patel@wwt.com',
        title: 'Security Architect',
        department: 'Security',
        office: 'St. Louis',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Maya Patel',
      email: 'maya.patel@wwt.com',
      role: 'wwt_resource',
    });
    expect(contactModel.getByEmail('maya.patel@wwt.com')).toBeDefined();
  });
});
