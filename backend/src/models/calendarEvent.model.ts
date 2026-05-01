import { db } from '../db/database.js';

export interface CalendarEvent {
  uid: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  meeting_url: string | null;
  organizer: string | null;
  attendee_count: number;
  is_all_day: number;
  synced_at: string;
}

export interface CalendarEventInsert {
  uid: string;
  title: string;
  start_at: string;
  end_at: string;
  location?: string | null;
  meeting_url?: string | null;
  organizer?: string | null;
  attendee_count?: number;
  is_all_day?: number;
}

const upsertStmt = db.prepare<CalendarEventInsert>(`
  INSERT INTO calendar_events (uid, title, start_at, end_at, location, meeting_url, organizer, attendee_count, is_all_day, synced_at)
  VALUES (@uid, @title, @start_at, @end_at, @location, @meeting_url, @organizer, @attendee_count, @is_all_day, datetime('now'))
  ON CONFLICT(uid) DO UPDATE SET
    title          = excluded.title,
    start_at       = excluded.start_at,
    end_at         = excluded.end_at,
    location       = excluded.location,
    meeting_url    = excluded.meeting_url,
    organizer      = excluded.organizer,
    attendee_count = excluded.attendee_count,
    is_all_day     = excluded.is_all_day,
    synced_at      = excluded.synced_at
`);

const listForDayStmt = db.prepare<[string, string], CalendarEvent>(`
  SELECT * FROM calendar_events
  WHERE start_at >= ? AND start_at < ?
  ORDER BY start_at ASC
`);

const listVisibleStmt = db.prepare<[string, string, string], CalendarEvent>(`
  SELECT e.* FROM calendar_events e
  WHERE e.start_at >= ? AND e.start_at < ?
    AND NOT EXISTS (
      SELECT 1 FROM calendar_event_hides h
      WHERE h.uid = e.uid AND h.hide_date = ?
    )
  ORDER BY e.start_at ASC
`);

const listHiddenStmt = db.prepare<[string, string, string], CalendarEvent>(`
  SELECT e.* FROM calendar_events e
  INNER JOIN calendar_event_hides h ON h.uid = e.uid AND h.hide_date = ?
  WHERE e.start_at >= ? AND e.start_at < ?
  ORDER BY e.start_at ASC
`);

const insertHideStmt = db.prepare<[string, string]>(`
  INSERT OR IGNORE INTO calendar_event_hides (uid, hide_date)
  VALUES (?, ?)
`);

const deleteHideStmt = db.prepare<[string, string]>(`
  DELETE FROM calendar_event_hides WHERE uid = ? AND hide_date = ?
`);

const deleteBeforeStmt = db.prepare<[string]>(`
  DELETE FROM calendar_events WHERE end_at < ?
`);

const upsertMany = db.transaction((events: CalendarEventInsert[]) => {
  for (const e of events) {
    upsertStmt.run({
      uid: e.uid,
      title: e.title,
      start_at: e.start_at,
      end_at: e.end_at,
      location: e.location ?? null,
      meeting_url: e.meeting_url ?? null,
      organizer: e.organizer ?? null,
      attendee_count: e.attendee_count ?? 0,
      is_all_day: e.is_all_day ?? 0,
    });
  }
});

/**
 * Compute UTC ISO bounds for a given LOCAL date.
 *
 * The input dateStr "YYYY-MM-DD" represents a date in the user's local
 * timezone. Events are stored as absolute UTC timestamps. We need the
 * UTC range that maps to local-midnight → next-local-midnight so events
 * at 8 PM local on date X don't leak into date X+1 (or vice versa for
 * early-morning events). The Node process and the user share a machine
 * (and therefore a TZ), so `new Date(y, m-1, d)` gives midnight local.
 */
function localDayBoundsUtc(dateStr: string): [string, string] {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    // Fallback: treat the string as UTC bounds (legacy behavior).
    return [`${dateStr}T00:00:00.000Z`, `${dateStr}T23:59:59.999Z`];
  }
  const startLocal = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endLocal = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return [startLocal.toISOString(), endLocal.toISOString()];
}

export const calendarEventModel = {
  upsertMany(events: CalendarEventInsert[]): void {
    upsertMany(events);
  },

  /** Returns all events for a day regardless of hide status. */
  listForDay(dateStr: string): CalendarEvent[] {
    const [start, end] = localDayBoundsUtc(dateStr);
    return listForDayStmt.all(start, end);
  },

  /** Returns events partitioned into visible (not hidden) and hidden lists. */
  listForDayPartitioned(dateStr: string): { visible: CalendarEvent[]; hidden: CalendarEvent[] } {
    const [start, end] = localDayBoundsUtc(dateStr);
    return {
      visible: listVisibleStmt.all(start, end, dateStr),
      hidden:  listHiddenStmt.all(dateStr, start, end),
    };
  },

  hideForDate(uid: string, dateStr: string): void {
    insertHideStmt.run(uid, dateStr);
  },

  unhideForDate(uid: string, dateStr: string): void {
    deleteHideStmt.run(uid, dateStr);
  },

  pruneOlderThan(dateStr: string): number {
    return deleteBeforeStmt.run(`${dateStr}T00:00:00.000Z`).changes;
  },
};
