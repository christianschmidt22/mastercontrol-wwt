/**
 * cronUtils.test.ts
 *
 * Unit tests for `getMostRecentCronTime` / `getNextCronTime`.
 *
 * The fixture day used in these tests is 2026-04-25 (today as of writing).
 * UTC is used to keep the math deterministic across runs that may be on
 * different host timezones; `cron-parser` defaults to local time, but
 * because we feed it a Date built from a UNIX timestamp the wall-clock
 * interpretation is consistent regardless of TZ as long as we compare
 * outputs in the same TZ basis.
 */

import { describe, it, expect } from 'vitest';
import { getMostRecentCronTime, getNextCronTime } from './cronUtils.js';

/**
 * Build a UNIX-seconds timestamp for a local-time YYYY-MM-DD HH:MM. We use
 * local time because `cron-parser` interprets cron expressions in the
 * runtime's local timezone by default, and these tests assert on
 * local-clock semantics ("today's 07:00").
 */
function localUnixSecs(year: number, month1: number, day: number, hour: number, minute: number): number {
  const d = new Date(year, month1 - 1, day, hour, minute, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

describe('getMostRecentCronTime', () => {
  it('returns the same day\'s 07:00 when called at 14:00', () => {
    // 2026-04-25 14:00 local
    const queryTime = localUnixSecs(2026, 4, 25, 14, 0);
    const expected = localUnixSecs(2026, 4, 25, 7, 0);

    const result = getMostRecentCronTime('0 7 * * *', queryTime);

    expect(result).toBe(expected);
  });

  it('returns null when called before the first occurrence of the schedule', () => {
    // The cron expression `0 7 1 1 *` fires at 07:00 every Jan 1. Querying
    // 30 seconds after the epoch (1970-01-01T00:00:30 UTC) places the prior
    // fire-time in 1969 — outside cron-parser's default lookup window, so
    // `prev()` throws and our wrapper translates that into `null`.
    const queryTime = 30; // epoch + 30s
    const result = getMostRecentCronTime('0 7 1 1 *', queryTime);

    expect(result).toBeNull();
  });
});

describe('getNextCronTime', () => {
  it('returns the next day\'s 07:00 when called at 14:00', () => {
    const queryTime = localUnixSecs(2026, 4, 25, 14, 0);
    const expected = localUnixSecs(2026, 4, 26, 7, 0);

    const result = getNextCronTime('0 7 * * *', queryTime);

    expect(result).toBe(expected);
  });
});
