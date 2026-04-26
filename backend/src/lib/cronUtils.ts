/**
 * Cron expression helpers used by the scheduler service.
 *
 * Two exports:
 *   - `getMostRecentCronTime(expr, nowSecs)` — the most recent cron fire-time
 *     ≤ now (UNIX seconds), or `null` if the schedule has no past occurrence
 *     before `now` (e.g. `0 7 1 1 *` queried at epoch+30s, where the previous
 *     fire would be in 1969 — `cron-parser` clamps to the current year by
 *     default and may throw OutOfRange).
 *   - `getNextCronTime(expr, nowSecs)` — the next cron fire-time > now
 *     (UNIX seconds).
 *
 * Both functions take/return UNIX seconds (integer). `cron-parser` works in
 * `Date` objects internally; this wrapper converts at the boundary so callers
 * can store the result as INTEGER columns in SQLite.
 */

import parser from 'cron-parser';

function dateToUnixSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/**
 * Returns the most recent cron fire-time at or before `nowSecs`, in UNIX
 * seconds. Returns `null` if the schedule has no past occurrence before now
 * within `cron-parser`'s lookup window (i.e. `prev()` throws because there is
 * nothing prior).
 *
 * Note: `cron-parser`'s `prev()` returns the strictly-previous fire-time when
 * called on an interval seeded with `currentDate = now`. If `now` itself is
 * exactly a fire-time, `prev()` would return the one before; that's fine for
 * the missed-jobs use case (we only care about whether anything was missed
 * relative to the stored `last_run_at`).
 */
export function getMostRecentCronTime(expr: string, nowSecs: number): number | null {
  try {
    const interval = parser.parseExpression(expr, {
      currentDate: new Date(nowSecs * 1000),
    });
    const prev = interval.prev();
    const secs = dateToUnixSeconds(prev.toDate());
    // cron-parser walks back forever (e.g. an annual schedule queried just
    // after the epoch returns 1969). Clamp pre-epoch results to null — the
    // scheduler treats "no past fire-time" as "nothing to catch up."
    return secs < 0 ? null : secs;
  } catch {
    // cron-parser throws when there is no previous occurrence inside its
    // lookup range. Same null contract.
    return null;
  }
}

/**
 * Returns the next cron fire-time strictly greater than `nowSecs`, in UNIX
 * seconds. Throws if the expression is invalid.
 */
export function getNextCronTime(expr: string, nowSecs: number): number {
  const interval = parser.parseExpression(expr, {
    currentDate: new Date(nowSecs * 1000),
  });
  const next = interval.next();
  return dateToUnixSeconds(next.toDate());
}
