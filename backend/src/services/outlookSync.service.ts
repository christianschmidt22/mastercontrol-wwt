/**
 * outlookSync.service.ts — periodic sync of Outlook inbox + sent items.
 *
 * Called every 15 minutes from scheduler.service.ts.
 *
 * Steps:
 *   1. Check connected (refresh token present); skip if not.
 *   2. Ensure access token is fresh via refreshIfNeeded().
 *   3. Fetch the 50 most recent messages from inbox + sentItems.
 *   4. Upsert each into outlook_messages.
 *   5. Run simple org name matching on subject + bodyPreview.
 *   6. Upsert matches into outlook_message_orgs.
 *   7. Update last_outlook_sync_at in settings.
 *
 * R-013: Raw Graph responses must not be logged (may contain email body content).
 *        Log metadata only (message ids, counts, status codes).
 */

import { getOutlookStatus, graphFetch, refreshIfNeeded } from './outlook.service.js';
import { outlookMessageModel } from '../models/outlookMessage.model.js';
import { organizationModel } from '../models/organization.model.js';
import { settingsModel } from '../models/settings.model.js';

// ---------------------------------------------------------------------------
// Graph response shapes (minimal — only fields we select)
// ---------------------------------------------------------------------------

interface GraphEmailAddress {
  name?: string;
  address?: string;
}

interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  sentDateTime?: string;
  hasAttachments?: boolean;
  bodyPreview?: string;
}

interface GraphMessagesResponse {
  value?: GraphMessage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SELECT_FIELDS = [
  'id',
  'internetMessageId',
  'conversationId',
  'subject',
  'from',
  'toRecipients',
  'ccRecipients',
  'sentDateTime',
  'hasAttachments',
  'bodyPreview',
].join(',');

const FETCH_PARAMS = `$select=${SELECT_FIELDS}&$top=50&$orderby=sentDateTime desc`;

async function fetchFolder(folderPath: string): Promise<GraphMessage[]> {
  const res = await graphFetch(`${folderPath}/messages?${FETCH_PARAMS}`);
  if (!res.ok) {
    console.warn('[outlookSync] folder fetch failed', {
      folder: folderPath,
      status: res.status,
    });
    return [];
  }
  const data = (await res.json()) as GraphMessagesResponse;
  return data.value ?? [];
}

function extractEmails(recipients: GraphRecipient[] | undefined): string[] {
  if (!recipients) return [];
  return recipients
    .map((r) => r.emailAddress?.address ?? '')
    .filter((e) => e.length > 0);
}

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
  const status = await getOutlookStatus();
  if (!status.connected) {
    // Not authenticated — skip silently.
    return;
  }

  await refreshIfNeeded();

  // Load all org names once for mention matching.
  const customers = organizationModel.listByType('customer');
  const oems = organizationModel.listByType('oem');
  const allOrgs = [...customers, ...oems].map((o) => ({ id: o.id, name: o.name }));

  // Fetch inbox + sentItems in parallel.
  const [inboxMessages, sentMessages] = await Promise.all([
    fetchFolder('/me/mailFolders/inbox'),
    fetchFolder('/me/mailFolders/sentItems'),
  ]);

  const allMessages = [...inboxMessages, ...sentMessages];

  // De-duplicate by internetMessageId (may appear in both folders for self-emails)
  const seen = new Set<string>();
  const uniqueMessages: GraphMessage[] = [];
  for (const m of allMessages) {
    const key = m.internetMessageId ?? m.id;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueMessages.push(m);
  }

  let upsertCount = 0;
  let linkCount = 0;

  for (const gm of uniqueMessages) {
    const internetMessageId = gm.internetMessageId ?? gm.id;
    if (!internetMessageId) continue;

    const persisted = outlookMessageModel.upsert({
      internet_message_id: internetMessageId,
      thread_id: gm.conversationId ?? null,
      subject: gm.subject ?? null,
      from_email: gm.from?.emailAddress?.address ?? null,
      from_name: gm.from?.emailAddress?.name ?? null,
      to_emails: extractEmails(gm.toRecipients),
      cc_emails: extractEmails(gm.ccRecipients),
      sent_at: gm.sentDateTime ?? null,
      has_attachments: gm.hasAttachments ?? false,
      body_preview: gm.bodyPreview ?? null,
    });
    upsertCount++;

    // Run org mention matching on subject + bodyPreview.
    const textToMatch = [gm.subject ?? '', gm.bodyPreview ?? ''].join(' ');
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
