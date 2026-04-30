import { describe, it, expect } from 'vitest';
import { extractMeetingUrl } from './meetingUrl.js';

describe('extractMeetingUrl', () => {
  // -------------------------------------------------------------------------
  // Null / empty inputs
  // -------------------------------------------------------------------------
  it('returns null for null input', () => {
    expect(extractMeetingUrl(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractMeetingUrl(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractMeetingUrl('')).toBeNull();
  });

  it('returns null when no meeting URL present', () => {
    expect(extractMeetingUrl('Join us in Conference Room B at 123 Main St.')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Per-provider positive cases
  // -------------------------------------------------------------------------
  it('matches Teams meetup-join URL', () => {
    const url = 'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_abc123%40thread.v2/0?context=%7B%22Tid%22%3A%22x%22%7D';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches Teams /meet/ URL', () => {
    const url = 'https://teams.microsoft.com/meet/abc123def';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches Teams Live URL', () => {
    const url = 'https://teams.live.com/meet/9876543210';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches Zoom /j/ URL', () => {
    const url = 'https://company.zoom.us/j/12345678901?pwd=secret';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches Zoom /my/ personal room URL', () => {
    const url = 'https://company.zoom.us/my/personal.room';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches ZoomGov URL', () => {
    const url = 'https://agency.zoomgov.com/j/12345678901';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches Google Meet URL', () => {
    const url = 'https://meet.google.com/abc-defg-hij';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches Webex /meet/ URL', () => {
    const url = 'https://company.webex.com/meet/john.doe';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches Webex wbxmjs joinservice URL', () => {
    const url = 'https://company.webex.com/wbxmjs/joinservice/sites/company/meeting/download/abc123';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches GoToMeeting global URL', () => {
    const url = 'https://global.gotomeeting.com/join/123456789';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches GoToMeeting custom subdomain URL', () => {
    const url = 'https://acme.gotomeeting.com/join/987654321';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches BlueJeans URL', () => {
    const url = 'https://bluejeans.com/123456789';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  it('matches Skype invite URL', () => {
    const url = 'https://join.skype.com/invite/AbCdEfGhIjKl';
    expect(extractMeetingUrl(url)).toBe(url);
  });

  // -------------------------------------------------------------------------
  // Stripping
  // -------------------------------------------------------------------------
  it('strips trailing punctuation (period)', () => {
    const result = extractMeetingUrl('Click here: https://teams.microsoft.com/l/meetup-join/abc.');
    expect(result).toBe('https://teams.microsoft.com/l/meetup-join/abc');
  });

  it('strips trailing comma', () => {
    const result = extractMeetingUrl('Join: https://meet.google.com/abc-defg-hij,');
    expect(result).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('strips surrounding angle brackets', () => {
    const result = extractMeetingUrl('<https://meet.google.com/abc-defg-hij>');
    expect(result).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('strips surrounding quotes', () => {
    const result = extractMeetingUrl('"https://meet.google.com/abc-defg-hij"');
    expect(result).toBe('https://meet.google.com/abc-defg-hij');
  });

  // -------------------------------------------------------------------------
  // Embedded in prose / ICS blobs
  // -------------------------------------------------------------------------
  it('extracts Teams URL buried in a typical Outlook ICS DESCRIPTION blob', () => {
    const blob = `________________________________________________________________________________

Microsoft Teams Meeting

Join on your computer, mobile app or room device
Click here to join the meeting <https://teams.microsoft.com/l/meetup-join/19%3Ameeting_abc%40thread.v2/0?context=%7B%7D>

Meeting ID: 123 456 789 01
Passcode: xYzAb1

Download Teams | Join on the web
________________________________________________________________________________
Learn More | Meeting options
________________________________________________________________________________`;
    const result = extractMeetingUrl(blob);
    expect(result).toBe(
      'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_abc%40thread.v2/0?context=%7B%7D',
    );
  });

  it('extracts Zoom URL embedded in description text', () => {
    const desc = 'Team standup — please join via https://company.zoom.us/j/98765432100?pwd=abc. See you there!';
    expect(extractMeetingUrl(desc)).toBe('https://company.zoom.us/j/98765432100?pwd=abc');
  });

  // -------------------------------------------------------------------------
  // Multiple URLs — returns first match
  // -------------------------------------------------------------------------
  it('returns first meeting URL when multiple are present', () => {
    const text =
      'Primary: https://meet.google.com/abc-defg-hij\nFallback: https://company.zoom.us/j/12345678901';
    // Google Meet pattern is listed after Teams/Zoom in PATTERNS, so the first
    // pattern that matches wins; Zoom appears at a lower index than Google Meet.
    const result = extractMeetingUrl(text);
    // Zoom pattern (index ~3) is before Google Meet (index ~6)
    expect(result).toBe('https://company.zoom.us/j/12345678901');
  });
});
