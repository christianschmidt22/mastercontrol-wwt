/**
 * outlookCalendar.service.ts
 *
 * Calendar read path backed by the user's running Classic Outlook session.
 * This does not launch Outlook or manage auth. The active COM session is the
 * delegated Microsoft 365 boundary.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PS1_PATH = fileURLToPath(
  new URL('../scripts/outlook-calendar-fetch.ps1', import.meta.url),
);

export interface RawOutlookCalendarEvent {
  uid: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  body: string | null;
  organizer: string | null;
  attendee_count: number;
  is_all_day: number;
}

interface Ps1CalendarResult {
  error: string | null;
  events: RawOutlookCalendarEvent[];
}

function isRawEvent(value: unknown): value is RawOutlookCalendarEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event['uid'] === 'string' &&
    typeof event['title'] === 'string' &&
    typeof event['start_at'] === 'string' &&
    typeof event['end_at'] === 'string'
  );
}

function parsePs1Result(stdout: string): Ps1CalendarResult {
  const parsed = JSON.parse(stdout.trim()) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Outlook calendar script returned non-object JSON.');
  }

  const result = parsed as Record<string, unknown>;
  const error = typeof result['error'] === 'string' ? result['error'] : null;
  const eventsRaw = Array.isArray(result['events']) ? result['events'] : [];
  const events = eventsRaw.filter(isRawEvent).map((event) => ({
    uid: event.uid,
    title: event.title,
    start_at: event.start_at,
    end_at: event.end_at,
    location: event.location ?? null,
    body: event.body ?? null,
    organizer: event.organizer ?? null,
    attendee_count: Number.isFinite(event.attendee_count) ? event.attendee_count : 0,
    is_all_day: event.is_all_day ? 1 : 0,
  }));

  return { error, events };
}

export async function fetchOutlookCalendarEvents(
  windowStart: Date,
  windowEnd: Date,
): Promise<RawOutlookCalendarEvent[]> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderrBytes = 0;

    const child = spawn('powershell.exe', [
      '-NonInteractive',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      PS1_PATH,
      '-WindowStartIso',
      windowStart.toISOString(),
      '-WindowEndIso',
      windowEnd.toISOString(),
    ]);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start Outlook calendar COM fetch: ${err.message}`));
    });

    child.on('close', (code) => {
      if (stderrBytes > 0) {
        console.warn('[outlookCalendar] ps1 stderr', { bytes: stderrBytes });
      }

      if (code !== 0) {
        reject(new Error(`Outlook calendar COM fetch exited with code ${code ?? 'unknown'}.`));
        return;
      }

      if (!stdout.trim()) {
        reject(new Error('Outlook calendar COM fetch returned no output.'));
        return;
      }

      try {
        const result = parsePs1Result(stdout);
        if (result.error) {
          reject(new Error(result.error));
          return;
        }
        resolve(result.events);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse Outlook calendar COM output.'));
      }
    });
  });
}
