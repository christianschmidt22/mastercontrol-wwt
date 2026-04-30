/**
 * outlookSync.service.ts — periodic sync of Outlook inbox + sent items.
 *
 * Called every 15 minutes from scheduler.service.ts.
 *
 * Steps:
 *   1. Fetch messages via the PowerShell COM script (outlook.service.ts).
 *   2. Upsert each into outlook_messages.
 *   3. Run simple org name matching on subject + bodyPreview.
 *   4. Upsert matches into outlook_message_orgs.
 *   5. Update last_outlook_sync_at in settings.
 *
 * R-013: Raw message content must not be logged (may contain sensitive email
 *        body content). Log metadata only (message ids, counts, status).
 */

import { fetchOutlookMessages } from './outlook.service.js';
import { outlookMessageModel } from '../models/outlookMessage.model.js';
import { organizationModel } from '../models/organization.model.js';
import { settingsModel } from '../models/settings.model.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple substring-based org name matching against subject + bodyPreview.
 * Returns org ids with a confidence score (0.8 for exact word-boundary match,
 * 0.6 for substring). Avoids LLM calls in sync path to keep it fast + cheap.
 */
function matchOrgs(
  text: string,
  orgs: Array<{ id: number; name: string }>,
): Array<{ orgId: number; confidence: number }> {
  const lowerText = text.toLowerCase();
  const results: Array<{ orgId: number; confidence: number }> = [];

  for (const org of orgs) {
    const lowerName = org.name.toLowerCase();
    if (lowerName.length < 3) continue; // skip very short names to avoid false positives

    const idx = lowerText.indexOf(lowerName);
    if (idx === -1) continue;

    // Word-boundary check: character before/after the match should be non-word
    const before = idx > 0 ? lowerText[idx - 1] : ' ';
    const after = idx + lowerName.length < lowerText.length
      ? lowerText[idx + lowerName.length]
      : ' ';

    const wordBoundary = /\W/.test(before ?? ' ') && /\W/.test(after ?? ' ');
    results.push({ orgId: org.id, confidence: wordBoundary ? 0.8 : 0.6 });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncOutlook(): Promise<void> {
  // Load all org names once for mention matching.
  const customers = organizationModel.listByType('customer');
  const oems = organizationModel.listByType('oem');
  const allOrgs = [...customers, ...oems].map((o) => ({ id: o.id, name: o.name }));

  // Fetch messages via COM — returns [] if Outlook is not running.
  const rawMessages = await fetchOutlookMessages(50);

  if (rawMessages.length === 0) {
    // Outlook not running or no messages — skip silently, don't update sync time.
    console.log('[outlookSync] no messages returned (Outlook may not be running)');
    return;
  }

  // De-duplicate by internet_message_id (may appear in both inbox + sent for self-emails)
  const seen = new Set<string>();
  const unique = rawMessages.filter((m) => {
    if (!m.internet_message_id || seen.has(m.internet_message_id)) return false;
    seen.add(m.internet_message_id);
    return true;
  });

  let upsertCount = 0;
  let linkCount = 0;

  for (const rm of unique) {
    const persisted = outlookMessageModel.upsert({
      internet_message_id: rm.internet_message_id,
      thread_id: null,
      subject: rm.subject ?? null,
      from_email: rm.from_email ?? null,
      from_name: rm.from_name ?? null,
      to_emails: Array.isArray(rm.to_emails) ? rm.to_emails : [],
      cc_emails: Array.isArray(rm.cc_emails) ? rm.cc_emails : [],
      sent_at: rm.sent_at ?? null,
      has_attachments: Boolean(rm.has_attachments),
      body_preview: rm.body_preview ?? null,
    });
    upsertCount++;

    // Run org mention matching on subject + body_preview.
    const textToMatch = [rm.subject ?? '', rm.body_preview ?? ''].join(' ');
    if (textToMatch.trim().length > 0 && allOrgs.length > 0) {
      const matches = matchOrgs(textToMatch, allOrgs);
      for (const { orgId, confidence } of matches) {
        outlookMessageModel.upsertOrgLink(persisted.id, orgId, confidence);
        linkCount++;
      }
    }
  }

  settingsModel.set('last_outlook_sync_at', new Date().toISOString());

  console.log('[outlookSync] sync complete', {
    messages: upsertCount,
    org_links: linkCount,
  });
}
