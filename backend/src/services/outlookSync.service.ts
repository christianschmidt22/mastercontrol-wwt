/**
 * outlookSync.service.ts
 *
 * Runs the Outlook sync pipeline on demand or on a schedule:
 *   1. Invoke outlook-fetch.ps1 via COM → get recent messages as JSON.
 *   2. Upsert each message into `outlook_messages`.
 *   3. Match messages to organizations by sender domain / subject keywords
 *      and upsert links into `outlook_message_orgs`.
 *   4. For messages with attachments, call saveMessageAttachments() to save
 *      qualifying files to the vault and index them as `documents` rows.
 *
 * Idempotent: re-running the sync only writes new data.
 */

import * as child_process from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { db } from '../db/database.js';
import { logAlert } from '../models/systemAlert.model.js';
import { saveMessageAttachments, type OutlookMessage, type OrgLink } from './outlookAttachment.service.js';
import { ensureOutlookRunning, closeOutlookIfWeStartedIt } from './outlook.service.js';

// ---------------------------------------------------------------------------
// PS1 path — same pattern as other services that shell out to PowerShell
// ---------------------------------------------------------------------------

const FETCH_PS1 = fileURLToPath(new URL('../scripts/outlook-fetch.ps1', import.meta.url));

// ---------------------------------------------------------------------------
// Raw shape returned by outlook-fetch.ps1
// ---------------------------------------------------------------------------

interface RawAttachment {
  name: string;
  size: number;
  content_type: string;
}

interface RawMessage {
  internet_message_id: string;
  subject: string;
  sender: string | null;
  sent_at: string | null;
  body_preview: string | null;
  has_attachments: number;
  attachments: RawAttachment[];
}

// ---------------------------------------------------------------------------
// Module-level types
// ---------------------------------------------------------------------------

interface OrgRow {
  id: number;
  name: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const upsertMessageStmt = db.prepare<
  [string, string, string | null, string | null, string | null, number, string],
  { id: number }
>(
  `INSERT INTO outlook_messages
     (internet_message_id, subject, sender, sent_at, body_preview, has_attachments, attachments_meta)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(internet_message_id) DO UPDATE SET
     subject          = excluded.subject,
     sender           = excluded.sender,
     sent_at          = excluded.sent_at,
     body_preview     = excluded.body_preview,
     has_attachments  = excluded.has_attachments,
     attachments_meta = excluded.attachments_meta,
     synced_at        = datetime('now')
   RETURNING id`,
);

const upsertOrgLinkStmt = db.prepare<[number, number, number]>(
  `INSERT INTO outlook_message_orgs (message_id, org_id, confidence)
   VALUES (?, ?, ?)
   ON CONFLICT(message_id, org_id) DO UPDATE SET confidence = excluded.confidence`,
);

const listAllOrgsStmt = db.prepare<[], OrgRow>(
  'SELECT id, name, type FROM organizations ORDER BY name COLLATE NOCASE',
);

const listMsgOrgLinksStmt = db.prepare<[number], OrgLink>(
  `SELECT omo.org_id, o.name AS org_name, o.type AS org_type
   FROM outlook_message_orgs omo
   JOIN organizations o ON o.id = omo.org_id
   WHERE omo.message_id = ?
   ORDER BY omo.confidence DESC
   LIMIT 3`,
);

// ---------------------------------------------------------------------------
// Org matching
// ---------------------------------------------------------------------------

/**
 * Attempt to match a raw message to known organizations.
 *
 * Strategy (simple heuristics — can be extended later):
 *   1. Extract the sender domain and look for orgs whose name contains a
 *      keyword from that domain.
 *   2. Scan the subject for org name matches.
 *
 * Returns an array of { org_id, org_name, org_type, confidence } sorted by
 * confidence descending, capped at the top 3 matches.
 */
function matchOrgs(raw: RawMessage): Array<{ org_id: number; org_name: string; org_type: string; confidence: number }> {
  const allOrgs = listAllOrgsStmt.all();
  const matches: Array<{ org_id: number; org_name: string; org_type: string; confidence: number }> = [];

  const senderDomain = (raw.sender ?? '')
    .toLowerCase()
    .replace(/^.*@/, '')
    .replace(/\.$/, '');

  const subjectLower = (raw.subject ?? '').toLowerCase();

  for (const org of allOrgs) {
    const orgNameLower = org.name.toLowerCase();
    let confidence = 0;

    // Domain keyword match: e.g. sender "joe@fairview.org" matches "Fairview Health Services"
    if (senderDomain) {
      const domainParts = senderDomain.split('.').filter((p) => p.length > 3);
      for (const part of domainParts) {
        if (orgNameLower.includes(part)) {
          confidence = Math.max(confidence, 0.7);
        }
      }
    }

    // Subject keyword match
    if (subjectLower && orgNameLower.length > 3 && subjectLower.includes(orgNameLower.split(' ')[0])) {
      confidence = Math.max(confidence, 0.4);
    }

    if (confidence > 0) {
      matches.push({ org_id: org.id, org_name: org.name, org_type: org.type, confidence });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

// ---------------------------------------------------------------------------
// PS1 runner
// ---------------------------------------------------------------------------

function runFetchPs1(): RawMessage[] {
  let stdout = '';
  try {
    stdout = child_process.execFileSync(
      'powershell.exe',
      [
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', FETCH_PS1,
        '-MaxMessages', '200',
      ],
      { encoding: 'utf8', timeout: 120_000 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`outlook-fetch.ps1 spawn failed: ${msg}`);
  }

  const trimmed = stdout.trim();
  if (!trimmed || trimmed === 'null') return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as RawMessage[];
  } catch {
    throw new Error('outlook-fetch.ps1 output was not valid JSON');
  }
}

// ---------------------------------------------------------------------------
// Main sync
// ---------------------------------------------------------------------------

export interface OutlookSyncResult {
  messages_upserted: number;
  org_links: number;
  attachment_jobs: number;
}

export async function syncOutlook(): Promise<OutlookSyncResult> {
  // Ensure Outlook is running (auto-launch if needed, wait up to 30s).
  // weStartedIt tracks whether WE launched Outlook so we can close it when done.
  const { ready, weStartedIt } = await ensureOutlookRunning();
  if (!ready) {
    console.warn('[outlookSync] Outlook not accessible — skipping sync');
    return { messages_upserted: 0, org_links: 0, attachment_jobs: 0 };
  }

  try {
    let rawMessages: RawMessage[];

    try {
      rawMessages = runFetchPs1();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Outlook not running is expected on non-Windows or when the app is closed.
      console.warn(`[outlookSync] fetch skipped: ${msg}`);
      return { messages_upserted: 0, org_links: 0, attachment_jobs: 0 };
    }

    if (rawMessages.length === 0) {
      return { messages_upserted: 0, org_links: 0, attachment_jobs: 0 };
    }

    let messagesUpserted = 0;
    let orgLinksTotal = 0;
    let attachmentJobs = 0;

    for (const raw of rawMessages) {
      if (!raw.internet_message_id) continue;

      // Upsert the message row.
      const attachmentsMeta = JSON.stringify(raw.attachments ?? []);

      const msgRow = upsertMessageStmt.get(
        raw.internet_message_id,
        raw.subject ?? '',
        raw.sender ?? null,
        raw.sent_at ?? null,
        raw.body_preview ?? null,
        raw.has_attachments ?? 0,
        attachmentsMeta,
      );

      if (!msgRow) continue;
      const dbMsgId = msgRow.id;
      messagesUpserted++;

      // Match to orgs and upsert links.
      const orgMatches = matchOrgs(raw);
      for (const match of orgMatches) {
        upsertOrgLinkStmt.run(dbMsgId, match.org_id, match.confidence);
        orgLinksTotal++;
      }

      // Save attachments if the message has any.
      if (raw.has_attachments) {
        // Build the OutlookMessage shape expected by saveMessageAttachments.
        const dbMsg: OutlookMessage = {
          id: dbMsgId,
          internet_message_id: raw.internet_message_id,
          subject: raw.subject ?? '',
          sent_at: raw.sent_at ?? null,
          has_attachments: 1,
          attachments_meta: attachmentsMeta,
        };

        // Query org links with org name and type for path construction.
        const orgLinks = listMsgOrgLinksStmt.all(dbMsgId);

        try {
          await saveMessageAttachments(dbMsg, orgLinks);
          attachmentJobs++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[outlookSync] attachment save failed for message ${dbMsgId}: ${msg}`);
          logAlert('warn', 'outlookSync', 'Attachment save failed', err);
        }
      }
    }

    console.info(
      `[outlookSync] messages=${messagesUpserted} org_links=${orgLinksTotal} attachment_jobs=${attachmentJobs}`,
    );

    return {
      messages_upserted: messagesUpserted,
      org_links: orgLinksTotal,
      attachment_jobs: attachmentJobs,
    };
  } finally {
    // Close classic Outlook only if we launched it — leave user's session alone.
    await closeOutlookIfWeStartedIt(weStartedIt);
  }
}
