import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildApp } from '../test/app.js';
import { calendarEventModel } from '../models/calendarEvent.model.js';
import { settingsModel } from '../models/settings.model.js';

function mockGeocode(lat: string, lon: string): Response {
  return new Response(JSON.stringify([{ lat, lon }]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockRoute(distanceMeters: number): Response {
  return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: distanceMeters }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('mileage route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    settingsModel.remove('mastercontrol_root');
  });

  it('builds a mileage report from physical calendar locations and filters virtual/office events', async () => {
    const app = await buildApp();
    calendarEventModel.upsertMany([
      {
        uid: 'physical-1',
        title: 'Customer onsite',
        start_at: '2026-05-01T15:00:00.000Z',
        end_at: '2026-05-01T16:00:00.000Z',
        location: '1000 Nicollet Mall, Minneapolis, MN',
      },
      {
        uid: 'teams-1',
        title: 'Teams call',
        start_at: '2026-05-01T17:00:00.000Z',
        end_at: '2026-05-01T18:00:00.000Z',
        location: 'Microsoft Teams Meeting',
      },
      {
        uid: 'teams-physical-1',
        title: 'Customer onsite with Teams option',
        start_at: '2026-05-01T18:00:00.000Z',
        end_at: '2026-05-01T19:00:00.000Z',
        location: '860 Cliff Rd, Eagan, MN 55123; Microsoft Teams Meeting',
      },
      {
        uid: 'teams-physical-and-1',
        title: 'Commvault - Azure Protection',
        start_at: '2026-05-01T19:00:00.000Z',
        end_at: '2026-05-01T20:00:00.000Z',
        location: '14701 Charlson Rd, Eden Prairie, MN 55347 AND Microsoft Teams Meeting',
      },
      {
        uid: 'office-1',
        title: 'Office',
        start_at: '2026-05-02T14:00:00.000Z',
        end_at: '2026-05-02T15:00:00.000Z',
        location: '1601 Utica Ave S, St Louis Park, MN',
      },
      {
        uid: 'office-typo-1',
        title: 'Office typo',
        start_at: '2026-05-02T15:00:00.000Z',
        end_at: '2026-05-02T16:00:00.000Z',
        location: '601 Utica Ave S, St Louis Park, MN',
      },
      {
        uid: 'link-included-1',
        title: 'Calendar artifact',
        start_at: '2026-05-02T16:00:00.000Z',
        end_at: '2026-05-02T17:00:00.000Z',
        location: 'Link included',
      },
      {
        uid: 'gooseberry-1',
        title: 'Personal travel',
        start_at: '2026-05-02T18:00:00.000Z',
        end_at: '2026-05-02T19:00:00.000Z',
        location: 'Gooseberry Falls State Park',
      },
    ]);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const target =
        typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.toString()
            : url.url;
      if (target.includes('nominatim.openstreetmap.org')) return mockGeocode('45.0', '-93.0');
      if (target.includes('router.project-osrm.org')) return mockRoute(16093.44);
      throw new Error(`Unexpected URL ${target}`);
    });

    const res = await request(app)
      .get('/api/tools/mileage/report')
      .query({ start_date: '2026-05-01', end_date: '2026-05-02', calculate: 'true' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      start_date: '2026-05-01',
      end_date: '2026-05-02',
      from_address: '250 Pine St, Lino Lakes, MN 55014',
      total_miles: 60,
      excluded_count: 5,
    });
    expect(res.body.rows).toEqual([
      expect.objectContaining({
        uid: 'physical-1',
        subject: 'Customer onsite',
        to_address: '1000 Nicollet Mall, Minneapolis, MN',
        type: 'round trip',
        miles: 20,
        one_way_miles: 10,
        distance_source: 'osrm',
      }),
      expect.objectContaining({
        uid: 'teams-physical-1',
        subject: 'Customer onsite with Teams option',
        to_address: '860 Cliff Rd, Eagan, MN 55123',
        type: 'round trip',
        miles: 20,
        one_way_miles: 10,
        distance_source: 'osrm',
      }),
      expect.objectContaining({
        uid: 'teams-physical-and-1',
        subject: 'Commvault - Azure Protection',
        to_address: '14701 Charlson Rd, Eden Prairie, MN 55347',
        type: 'round trip',
        miles: 20,
        one_way_miles: 10,
        distance_source: 'osrm',
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(7);

    const cachedRes = await request(app)
      .get('/api/tools/mileage/report')
      .query({ start_date: '2026-05-01', end_date: '2026-05-02' });

    expect(cachedRes.status).toBe(200);
    expect(cachedRes.body.rows[0]).toMatchObject({
      miles: 20,
      distance_source: 'cache',
    });
    expect(cachedRes.body.rows[1]).toMatchObject({
      miles: 20,
      distance_source: 'cache',
    });
    expect(cachedRes.body.rows[2]).toMatchObject({
      miles: 20,
      distance_source: 'cache',
    });
    expect(fetchMock).toHaveBeenCalledTimes(7);

    const manualRes = await request(app)
      .post('/api/tools/mileage/calculate')
      .send({
        from_address: '250 Pine St, Lino Lakes, MN 55014',
        to_address: '1000 Nicollet Mall, Minneapolis, MN',
      });

    expect(manualRes.status).toBe(200);
    expect(manualRes.body).toMatchObject({
      from_address: '250 Pine St, Lino Lakes, MN 55014',
      to_address: '1000 Nicollet Mall, Minneapolis, MN',
      type: 'round trip',
      miles: 20,
      one_way_miles: 10,
      distance_source: 'cache',
    });
    expect(fetchMock).toHaveBeenCalledTimes(7);
  }, 10_000);

  it('exports editable mileage rows to a PDF in the MasterControl reports vault', async () => {
    const app = await buildApp();
    const rootDir = mkdtempSync(path.join(tmpdir(), 'mastercontrol-mileage-export-'));
    settingsModel.set('mastercontrol_root', rootDir);

    try {
      const res = await request(app)
        .post('/api/tools/mileage/export-pdf')
        .send({
          start_date: '2026-05-01',
          end_date: '2026-05-14',
          total_miles: 79,
          rows: [
            {
              uid: 'manual-1',
              date: '2026-05-14',
              subject: 'Edited lunch subject',
              from_address: '250 Pine St, Lino Lakes, MN 55014',
              to_address: '860 Cliff Rd, Eagan, MN 55123',
              type: 'round trip',
              miles: 79,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        file_name: expect.stringContaining('mileage-report-2026-05-01-to-2026-05-14'),
        file_path: expect.stringContaining(path.join('reports', 'mileage')),
        row_count: 1,
        total_miles: 79,
      });
      expect(existsSync(res.body.file_path)).toBe(true);
      expect(readFileSync(res.body.file_path, 'utf8').startsWith('%PDF-1.4')).toBe(true);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
