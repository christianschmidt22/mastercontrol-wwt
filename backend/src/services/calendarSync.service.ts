/**
 * calendarSync.service.ts
 *
 * Fetches the user's M365 calendar via an ICS subscription URL (stored
 * DPAPI-encrypted in settings as 'calendar_ics_url'), parses it with
 * node-ical, and upserts the results into the local `calendar_events` table.
 *
 * Recurring events are expanded into individual instances for a rolling
 * 90-day window so the today-query stays a simple date-range scan.
 *
 * Call scheduleCalendarSync() once at startup to register the cron job.
 * Call syncCalendar() directly for an on-demand refresh.
 */

import ical from 'node-ical';
import cron from 'node-cron';
import { settingsModel } from '../models/settings.model.js';
import { calendarEventModel, type CalendarEventInsert } from '../models/calendarEvent.model.js';
import { logAlert } from '../models/systemAlert.model.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parameterValueToString(raw: ical.ParameterValue | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw || null;
  return String(raw.val) || null;
}

function extractOrganizer(raw: ical.VEvent['organizer']): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw.replace(/^mailto:/i, '');
  if (typeof raw === 'object' && 'val' in raw) {
    const val = String(raw.val).replace(/^mailto:/i, '');
    // Prefer CN (display name) when present
    const cn = (raw.params as Record<string, string> | undefined)?.['CN'];
    return cn ? `${cn} <${val}>` : val;
  }
  return null;
}

function countAttendees(raw: ical.VEvent['attendee']): number {
  if (!raw) return 0;
  return Array.isArray(raw) ? raw.length : 1;
}

function toIso(d: Date): string {
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Core sync
// ---------------------------------------------------------------------------

export async function syncCalendar(): Promise<{ upserted: number; pruned: number }> {
  const url = settingsModel.get('calendar_ics_url');
  if (!url) {
    console.info('[calendarSync] calendar_ics_url not configured — skipping sync');
    return { upserted: 0, pruned: 0 };
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'MasterControl/1.0 calendar-sync' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`ICS fetch failed: ${res.status} ${res.statusText}`);
  }

  const body = await res.text();
  const parsed = ical.sync.parseICS(body);

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 1); // yesterday (catch in-progress events)
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + 90);

  const inserts: CalendarEventInsert[] = [];

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== 'VEVENT') continue;
    const event = component;
    if (!event.start || !event.summary) continue;

    const organizer = extractOrganizer(event.organizer);
    const attendeeCount = countAttendees(event.attendee);
    const title = typeof event.summary === 'string'
      ? event.summary
      : String((event.summary as { val: string }).val ?? '');

    if (event.rrule) {
      // Recurring: expand into discrete instances within the sync window.
      const instances = ical.expandRecurringEvent(event, {
        from: windowStart,
        to: windowEnd,
        includeOverrides: true,
        excludeExdates: true,
      });

      for (const inst of instances) {
        const startIso = toIso(inst.start);
        const endIso = inst.end ? toIso(inst.end) : toIso(inst.start);
        // Composite UID: base UID + occurrence date keeps upsert idempotent.
        const instanceUid = `${event.uid}:${inst.start.toISOString().slice(0, 10)}`;
        inserts.push({
          uid: instanceUid,
          title,
          start_at: startIso,
          end_at: endIso,
          location: parameterValueToString(event.location),
          organizer,
          attendee_count: attendeeCount,
          is_all_day: inst.isFullDay ? 1 : 0,
        });
      }
    } else {
      // Single occurrence — only store if within sync window.
      const start = event.start;
      if (start < windowStart || start > windowEnd) continue;
      const end = event.end ?? event.start;
      inserts.push({
        uid: event.uid,
        title,
        start_at: toIso(start),
        end_at: toIso(end),
        location: parameterValueToString(event.location),
        organizer,
        attendee_count: attendeeCount,
        is_all_day: start.dateOnly ? 1 : 0,
      });
    }
  }

  calendarEventModel.upsertMany(inserts);

  // Prune events that ended more than 7 days ago.
  const pruneDate = new Date(now);
  pruneDate.setDate(pruneDate.getDate() - 7);
  const pruned = calendarEventModel.pruneOlderThan(pruneDate.toISOString().slice(0, 10));

  settingsModel.set('calendar_last_sync', now.toISOString());

  console.info(`[calendarSync] upserted=${inserts.length} pruned=${pruned}`);
  return { upserted: inserts.length, pruned };
}

// ---------------------------------------------------------------------------
// Scheduler — runs at 06:00, 12:00, 17:00 local time (3×/day)
// ---------------------------------------------------------------------------

export function scheduleCalendarSync(): void {
  // Initial sync on startup (non-blocking).
  void syncCalendar().catch((err: unknown) => {
    console.warn('[calendarSync] startup sync failed', err instanceof Error ? err.message : String(err));
    logAlert('error', 'calendarSync', 'Startup calendar sync failed', err);
  });

  // 06:00, 12:00, 17:00 — covers morning brief + midday + end-of-day.
  cron.schedule('0 6,12,17 * * *', () => {
    void syncCalendar().catch((err: unknown) => {
      console.warn('[calendarSync] scheduled sync failed', err instanceof Error ? err.message : String(err));
      logAlert('error', 'calendarSync', 'Scheduled calendar sync failed', err);
    });
  });

  console.info('[calendarSync] scheduled at 06:00, 12:00, 17:00');
}
