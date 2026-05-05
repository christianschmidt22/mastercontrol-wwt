import { describe, expect, it } from 'vitest';
import { formatAlertTimestamp } from './alertTime';

describe('formatAlertTimestamp', () => {
  it('treats SQLite timezone-less alert timestamps as UTC and displays Central time', () => {
    expect(formatAlertTimestamp('2026-04-29 00:08:29')).toBe('Apr 28, 7:08 PM CT');
  });

  it('keeps explicit ISO UTC timestamps on the same Central-time display path', () => {
    expect(formatAlertTimestamp('2026-04-29T00:08:29.000Z')).toBe('Apr 28, 7:08 PM CT');
  });

  it('returns a dash for empty values', () => {
    expect(formatAlertTimestamp(null)).toBe('-');
  });
});
