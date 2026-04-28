import { db } from '../db/database.js';

export interface CalendarEvent {
  uid: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
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
  organizer?: string | null;
  attendee_count?: number;
  is_all_day?: number;
}

const upsertStmt = db.prepare<CalendarEventInsert>(`
  INSERT INTO calendar_events (uid, title, start_at, end_at, location, organizer, attendee_count, is_all_day, synced_at)
  VALUES (@uid, @title, @start_at, @end_at, @location, @organizer, @attendee_count, @is_all_day, datetime('now'))
  ON CONFLICT(uid) DO UPDATE SET
    title          = excluded.title,
    start_at       = excluded.start_at,
    end_at         = excluded.end_at,
    location       = excluded.location,
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
      organizer: e.organizer ?? null,
      attendee_count: e.attendee_count ?? 0,
      is_all_day: e.is_all_day ?? 0,
    });
  }
});

export const calendarEventModel = {
  upsertMany(events: CalendarEventInsert[]): void {
    upsertMany(events);
  },

  listForDay(dateStr: string): CalendarEvent[] {
    const start = `${dateStr}T00:00:00.000Z`;
    const end = `${dateStr}T23:59:59.999Z`;
    return listForDayStmt.all(start, end);
  },

  pruneOlderThan(dateStr: string): number {
    return deleteBeforeStmt.run(`${dateStr}T00:00:00.000Z`).changes;
  },
};
