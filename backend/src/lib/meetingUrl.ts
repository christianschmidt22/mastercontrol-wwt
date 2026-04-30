/**
 * meetingUrl.ts
 *
 * Pure helper — no DB, no I/O — for extracting a video-meeting join URL from
 * arbitrary text (ICS DESCRIPTION or LOCATION fields).
 *
 * Example URLs matched per pattern:
 *   Teams meetup-join : https://teams.microsoft.com/l/meetup-join/19%3A...
 *   Teams meet        : https://teams.microsoft.com/meet/abc123
 *   Teams Live        : https://teams.live.com/meet/9876543210
 *   Zoom j            : https://company.zoom.us/j/12345678901
 *   Zoom my           : https://company.zoom.us/my/personal.room
 *   ZoomGov           : https://agency.zoomgov.com/j/12345678901
 *   Google Meet       : https://meet.google.com/abc-defg-hij
 *   Webex             : https://company.webex.com/meet/john.doe
 *   GoToMeeting global: https://global.gotomeeting.com/join/123456789
 *   GoToMeeting other : https://acme.gotomeeting.com/join/123456789
 *   BlueJeans         : https://bluejeans.com/123456789
 *   Skype             : https://join.skype.com/invite/AbCdEfGhIjKl
 */

const PATTERNS: RegExp[] = [
  // Microsoft Teams — encoded meetup-join deep-links
  /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+/i,
  // Microsoft Teams — short /meet/ links
  /https:\/\/teams\.microsoft\.com\/meet\/[^\s<>"']+/i,
  // Teams Live (personal / free tier)
  /https:\/\/teams\.live\.com\/meet\/[^\s<>"']+/i,
  // Zoom — /j/ numeric meeting rooms
  /https:\/\/[a-z0-9-]+\.zoom\.us\/j\/[^\s<>"']+/i,
  // Zoom — /my/ personal rooms
  /https:\/\/[a-z0-9-]+\.zoom\.us\/my\/[^\s<>"']+/i,
  // ZoomGov (US government Zoom tenant)
  /https:\/\/[a-z0-9-]+\.zoomgov\.com\/j\/[^\s<>"']+/i,
  // Google Meet
  /https:\/\/meet\.google\.com\/[a-z0-9-]+/i,
  // Webex — covers /meet/, /wbxmjs/joinservice/, and ?m= variants
  /https:\/\/[a-z0-9-]+\.webex\.com\/[^\s<>"']+/i,
  // GoToMeeting — global subdomain
  /https:\/\/global\.gotomeeting\.com\/join\/[^\s<>"']+/i,
  // GoToMeeting — custom subdomains
  /https:\/\/[a-z0-9-]+\.gotomeeting\.com\/join\/[^\s<>"']+/i,
  // BlueJeans
  /https:\/\/bluejeans\.com\/[^\s<>"']+/i,
  // Skype for Business invite links
  /https:\/\/join\.skype\.com\/[^\s<>"']+/i,
];

/**
 * Returns the first meeting join URL found in `text`, or null.
 *
 * Strips surrounding angle brackets and trailing punctuation that ICS
 * generators sometimes attach to URLs.
 */
export function extractMeetingUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const re of PATTERNS) {
    const match = text.match(re);
    if (match) {
      return match[0]
        .replace(/^[<"']+/, '')
        .replace(/[>.,;:!?"')\]]+$/, '');
    }
  }
  return null;
}
