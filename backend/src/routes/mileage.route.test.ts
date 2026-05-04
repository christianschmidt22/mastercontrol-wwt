import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../test/app.js';
import { calendarEventModel } from '../models/calendarEvent.model.js';

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
      total_miles: 20,
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
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const cachedRes = await request(app)
      .get('/api/tools/mileage/report')
      .query({ start_date: '2026-05-01', end_date: '2026-05-02' });

    expect(cachedRes.status).toBe(200);
    expect(cachedRes.body.rows[0]).toMatchObject({
      miles: 20,
      distance_source: 'cache',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 10_000);
});
