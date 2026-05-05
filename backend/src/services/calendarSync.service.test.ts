import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database.js';
import { calendarEventModel } from '../models/calendarEvent.model.js';
import { settingsModel } from '../models/settings.model.js';
import { syncCalendar } from './calendarSync.service.js';
import { fetchOutlookCalendarEvents } from './outlookCalendar.service.js';

vi.mock('./outlookCalendar.service.js', () => ({
  fetchOutlookCalendarEvents: vi.fn(),
}));

const mockedFetchOutlookCalendarEvents = vi.mocked(fetchOutlookCalendarEvents);

describe('syncCalendar', () => {
  beforeEach(() => {
    mockedFetchOutlookCalendarEvents.mockReset();
  });

  it('syncs calendar events from the running Outlook COM session', async () => {
    mockedFetchOutlookCalendarEvents.mockResolvedValue([
      {
        uid: 'outlook-com:self:abc:20260506T150000Z',
        title: 'Customer availability review',
        start_at: '2026-05-06T15:00:00.000Z',
        end_at: '2026-05-06T15:30:00.000Z',
        location: 'Microsoft Teams Meeting',
        body: 'Join here: https://teams.microsoft.com/l/meetup-join/abc',
        organizer: 'Maya Patel',
        attendee_count: 4,
        is_all_day: 0,
      },
    ]);

    const result = await syncCalendar();

    expect(result.upserted).toBe(1);
    expect(mockedFetchOutlookCalendarEvents).toHaveBeenCalledOnce();
    const events = calendarEventModel.listForDay('2026-05-06');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      uid: 'outlook-com:self:abc:20260506T150000Z',
      title: 'Customer availability review',
      location: 'Microsoft Teams Meeting',
      meeting_url: 'https://teams.microsoft.com/l/meetup-join/abc',
      organizer: 'Maya Patel',
      attendee_count: 4,
      is_all_day: 0,
    });
    expect(settingsModel.get('calendar_last_sync')).toBeTruthy();
  });

  it('prunes stale local events after a COM-backed sync', async () => {
    mockedFetchOutlookCalendarEvents.mockResolvedValue([]);
    db.prepare(
      `INSERT INTO calendar_events
        (uid, title, start_at, end_at, synced_at)
       VALUES
        ('old-event', 'Old event', '2020-01-01T09:00:00.000Z', '2020-01-01T10:00:00.000Z', datetime('now'))`,
    ).run();

    const result = await syncCalendar();

    expect(result.upserted).toBe(0);
    expect(result.pruned).toBe(1);
    expect(calendarEventModel.listForDay('2020-01-01')).toHaveLength(0);
  });
});
