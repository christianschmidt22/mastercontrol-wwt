/**
 * calendarSync.service.ts
 *
 * Fetches the user's M365 calendar through the locally running Classic Outlook
 * COM session and upserts the results into the local `calendar_events` table.
 *
 * Outlook expands recurring events into individual instances for a rolling
 * 90-day window so the today-query stays a simple date-range scan.
 *
 * Call scheduleCalendarSync() once at startup to register the cron job.
 * Call syncCalendar() directly for an on-demand refresh.
 */

import cron from 'node-cron';
import { settingsModel } from '../models/settings.model.js';
import { calendarEventModel, type CalendarEventInsert } from '../models/calendarEvent.model.js';
import { logAlert } from '../models/systemAlert.model.js';
import { extractMeetingUrl } from '../lib/meetingUrl.js';
import { fetchOutlookCalendarEvents } from './outlookCalendar.service.js';

// ---------------------------------------------------------------------------
// Core sync
// ---------------------------------------------------------------------------

export async function syncCalendar(): Promise<{ upserted: number; pruned: number }> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 1); // yesterday (catch in-progress events)
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + 90);

  const rawEvents = await fetchOutlookCalendarEvents(windowStart, windowEnd);
  const inserts: CalendarEventInsert[] = rawEvents.map((event) => ({
    uid: event.uid,
    title: event.title,
    start_at: event.start_at,
    end_at: event.end_at,
    location: event.location,
    meeting_url: extractMeetingUrl(event.body) ?? extractMeetingUrl(event.location),
    organizer: event.organizer,
    attendee_count: event.attendee_count,
    is_all_day: event.is_all_day,
  }));

  calendarEventModel.upsertMany(inserts);

  // Prune events that ended more than 7 days ago.
  const pruneDate = new Date(now);
  pruneDate.setDate(pruneDate.getDate() - 7);
  const pruned = calendarEventModel.pruneOlderThan(pruneDate.toISOString().slice(0, 10));

  settingsModel.set('calendar_last_sync', now.toISOString());

  console.info(`[calendarSync] source=outlook-com upserted=${inserts.length} pruned=${pruned}`);
  return { upserted: inserts.length, pruned };
}

// ---------------------------------------------------------------------------
// Scheduler - runs at 06:00, 12:00, 17:00 local time (3x/day)
// ---------------------------------------------------------------------------

export function scheduleCalendarSync(): void {
  // Initial sync on startup (non-blocking).
  void syncCalendar().catch((err: unknown) => {
    console.warn('[calendarSync] startup sync failed', err instanceof Error ? err.message : String(err));
    logAlert('error', 'calendarSync', 'Startup calendar sync failed', err);
  });

  // 06:00, 12:00, 17:00 - covers morning brief + midday + end-of-day.
  cron.schedule('0 6,12,17 * * *', () => {
    void syncCalendar().catch((err: unknown) => {
      console.warn('[calendarSync] scheduled sync failed', err instanceof Error ? err.message : String(err));
      logAlert('error', 'calendarSync', 'Scheduled calendar sync failed', err);
    });
  });

  console.info('[calendarSync] scheduled at 06:00, 12:00, 17:00');
}
