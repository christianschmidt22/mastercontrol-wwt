/**
 * outlookMessage.model.ts
 *
 * Prepared-statement model for the outlook_messages and outlook_message_orgs
 * tables (created by 028_outlook_messages.sql).
 *
 * Layer rules: all SQL lives here. No SQL in service or route files.
 */

import { db } from '../db/database.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutlookMessage {
  id: number;
  internet_message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  /** Parsed JSON array of email address strings */
  to_emails: string[];
  /** Parsed JSON array of email address strings */
  cc_emails: string[];
  sent_at: string | null;
  has_attachments: boolean;
  body_preview: string | null;
  body_cached: string | null;
  synced_at: string;
}

export interface InsertOutlookMessage {
  internet_message_id: string;
  thread_id?: string | null;
  subject?: string | null;
  from_email?: string | null;
  from_name?: string | null;
  to_emails?: string[];
  cc_emails?: string[];
  sent_at?: string | null;
  has_attachments?: boolean;
  body_preview?: string | null;
  body_cached?: string | null;
}

interface OutlookMessageRow {
  id: number;
  internet_message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string | null;
  cc_emails: string | null;
  sent_at: string | null;
  has_attachments: number;
  body_preview: string | null;
  body_cached: string | null;
  synced_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hydrate(row: OutlookMessageRow): OutlookMessage {
  let toEmails: string[] = [];
  let ccEmails: string[] = [];

  try {
    toEmails = row.to_emails ? (JSON.parse(row.to_emails) as string[]) : [];
  } catch {
    toEmails = [];
  }
  try {
    ccEmails = row.cc_emails ? (JSON.parse(row.cc_emails) as string[]) : [];
  } catch {
    ccEmails = [];
  }

  return {
    id: row.id,
    internet_message_id: row.internet_message_id,
    thread_id: row.thread_id,
    subject: row.subject,
    from_email: row.from_email,
    from_name: row.from_name,
    to_emails: toEmails,
    cc_emails: ccEmails,
    sent_at: row.sent_at,
    has_attachments: row.has_attachments === 1,
    body_preview: row.body_preview,
    body_cached: row.body_cached,
    synced_at: row.synced_at,
  };
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const getByIdStmt = db.prepare<[number], OutlookMessageRow>(
  `SELECT * FROM outlook_messages WHERE id = ?`,
);

const upsertStmt = db.prepare<
  [string, string | null, string | null, string | null, string | null, string, string, string | null, number, string | null, string | null]
>(
  `INSERT INTO outlook_messages
     (internet_message_id, thread_id, subject, from_email, from_name, to_emails, cc_emails, sent_at, has_attachments, body_preview, body_cached)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(internet_message_id) DO UPDATE SET
     thread_id       = excluded.thread_id,
     subject         = excluded.subject,
     from_email      = excluded.from_email,
     from_name       = excluded.from_name,
     to_emails       = excluded.to_emails,
     cc_emails       = excluded.cc_emails,
     sent_at         = excluded.sent_at,
     has_attachments = excluded.has_attachments,
     body_preview    = excluded.body_preview,
     body_cached     = excluded.body_cached,
     synced_at       = datetime('now')`,
);

const getByInternetIdStmt = db.prepare<[string], OutlookMessageRow>(
  `SELECT * FROM outlook_messages WHERE internet_message_id = ?`,
);

const findByOrgStmt = db.prepare<[number, number], OutlookMessageRow>(
  `SELECT m.*
   FROM outlook_messages m
   JOIN outlook_message_orgs mo ON mo.message_id = m.id
   WHERE mo.org_id = ?
   ORDER BY m.sent_at DESC
   LIMIT ?`,
);

const upsertOrgLinkStmt = db.prepare<[number, number, number]>(
  `INSERT INTO outlook_message_orgs (message_id, org_id, confidence)
   VALUES (?, ?, ?)
   ON CONFLICT(message_id, org_id) DO UPDATE SET
     confidence = excluded.confidence`,
);

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export const outlookMessageModel = {
  /**
   * Upsert a message. On conflict (internet_message_id) updates all fields
   * except the primary key.  Returns the persisted row.
   */
  upsert(msg: InsertOutlookMessage): OutlookMessage {
    const toJson = JSON.stringify(msg.to_emails ?? []);
    const ccJson = JSON.stringify(msg.cc_emails ?? []);

    upsertStmt.run(
      msg.internet_message_id,
      msg.thread_id ?? null,
      msg.subject ?? null,
      msg.from_email ?? null,
      msg.from_name ?? null,
      toJson,
      ccJson,
      msg.sent_at ?? null,
      msg.has_attachments ? 1 : 0,
      msg.body_preview ?? null,
      msg.body_cached ?? null,
    );

    // Fetch by the natural key (not lastInsertRowid, which is 0 on a NO-OP update)
    const row = getByInternetIdStmt.get(msg.internet_message_id);
    if (!row) throw new Error(`outlook_messages upsert failed for ${msg.internet_message_id}`);
    return hydrate(row);
  },

  /** Find messages linked to a specific org, ordered by sent_at descending. */
  findByOrg(orgId: number, limit = 20): OutlookMessage[] {
    return findByOrgStmt.all(orgId, limit).map(hydrate);
  },

  /** Alias for findByOrg — used by the tile component hooks. */
  getRecentByOrg(orgId: number, limit = 10): OutlookMessage[] {
    return this.findByOrg(orgId, limit);
  },

  /** Get a single message by internal id. */
  getById(id: number): OutlookMessage | undefined {
    const row = getByIdStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  /**
   * Upsert an org link with a confidence score (0–1).
   * ON CONFLICT updates confidence so re-syncs can improve scores.
   */
  upsertOrgLink(messageId: number, orgId: number, confidence: number): void {
    upsertOrgLinkStmt.run(messageId, orgId, confidence);
  },
};
