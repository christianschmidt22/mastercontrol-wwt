/**
 * outlookAttachment.service.ts
 *
 * Orchestrates the fetch → filter → save → index pipeline for email attachments
 * arriving via the Outlook COM bridge.
 *
 * Entry point: saveMessageAttachments(message, orgLinks)
 *
 * Security:
 *  - Destination path is fully server-derived; user content never controls it
 *    directly.
 *  - All final file paths are verified to be strict descendants of
 *    mastercontrol_root using the same resolve+startsWith pattern as
 *    workvault.service.ts (resolveSafePath requires the file to exist first,
 *    so we do the check manually).
 *  - Attachment content is never logged (R-013).
 */

import * as path from 'node:path';
import * as child_process from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { db } from '../db/database.js';
import {
  getMastercontrolRoot,
  isMastercontrolRootConfigured,
  slugifyFolderName,
} from './fileSpace.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico',
  '.tif', '.tiff', '.svg', '.wmz', '.emz',
]);

const SKIP_CONTENT_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif',
  'image/bmp', 'image/tiff', 'image/x-wmf',
]);

// Only save known-useful document types; unknown extensions are skipped.
const KEEP_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.txt', '.md', '.csv', '.msg', '.eml', '.zip', '.7z',
]);

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MIN_SIZE_BYTES = 1024;             // 1 KB — skip inline images / signatures

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttachmentMeta {
  name: string;
  size: number;
  content_type: string;
}

export interface OutlookMessage {
  id: number;
  internet_message_id: string;
  subject: string;
  sent_at: string | null;
  has_attachments: number;
  attachments_meta: string; // JSON string: AttachmentMeta[]
}

export interface OrgLink {
  org_id: number;
  org_name: string;
  org_type: string; // 'customer' | 'oem'
}

// ---------------------------------------------------------------------------
// Prepared statements (inline — avoids touching outlook message model which
// is not in this task's scope)
// ---------------------------------------------------------------------------

const logLookupStmt = db.prepare<[string, string], { id: number }>(
  `SELECT id FROM outlook_attachment_log
   WHERE internet_message_id = ? AND attachment_name = ?
   LIMIT 1`,
);

const logInsertStmt = db.prepare<[string, string, string, number | null]>(
  `INSERT OR IGNORE INTO outlook_attachment_log
     (internet_message_id, attachment_name, vault_path, document_id)
   VALUES (?, ?, ?, ?)`,
);

const docInsertStmt = db.prepare<[number, string, string], { id: number }>(
  `INSERT INTO documents (organization_id, kind, label, url_or_path, source)
   VALUES (?, 'file', ?, ?, 'outlook_attachment')
   RETURNING id`,
);

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/**
 * Returns true if this attachment should be saved to the vault.
 * Skips by size bounds, by extension (block-list), by content-type, and by
 * the keep-extension allow-list (unknown types are skipped).
 */
export function shouldSaveAttachment(att: AttachmentMeta): boolean {
  if (att.size < MIN_SIZE_BYTES || att.size > MAX_SIZE_BYTES) return false;

  const ext = path.extname(att.name).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return false;

  const ct = att.content_type ? att.content_type.toLowerCase().split(';')[0].trim() : '';
  if (ct && SKIP_CONTENT_TYPES.has(ct)) return false;

  // Unknown extensions are not in KEEP_EXTENSIONS → skip.
  if (ext && !KEEP_EXTENSIONS.has(ext)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Derive a filesystem-safe slug from an email subject line, capped at 40 chars.
 */
export function slugifySubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/**
 * Format a date as YYYYMMDD for use in directory names.
 */
function datestamp(isoDate: string | null): string {
  if (!isoDate) return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Build the vault target directory for a message's attachments.
 *
 * Org-linked (customer):  <root>/customers/<slug>/reference/attachments/<YYYYMMDD>-<subject>/
 * Org-linked (OEM):       <root>/oems/<slug>/reference/attachments/<YYYYMMDD>-<subject>/
 * Unlinked:               <root>/00-inbox/attachments/<YYYYMMDD>-<subject>/
 */
export function buildTargetDir(
  root: string,
  message: { subject: string; sent_at: string | null },
  orgLink: OrgLink | null,
): string {
  const ds = datestamp(message.sent_at);
  const subjectSlug = slugifySubject(message.subject || 'no-subject');
  const folder = `${ds}-${subjectSlug}`;

  if (!orgLink) {
    return path.join(root, '00-inbox', 'attachments', folder);
  }

  const collection = orgLink.org_type === 'oem' ? 'oems' : 'customers';
  const orgSlug = slugifyFolderName(orgLink.org_name);
  return path.join(root, collection, orgSlug, 'reference', 'attachments', folder);
}

// ---------------------------------------------------------------------------
// PS1 runner
// ---------------------------------------------------------------------------

const PS1_PATH = fileURLToPath(new URL('../scripts/outlook-attachments.ps1', import.meta.url));

interface Ps1SavedFile {
  name: string;
  safe_name: string;
  size: number;
  path: string;
}

interface Ps1Result {
  error: string | null;
  saved: Ps1SavedFile[];
}

function runAttachmentPs1(messageId: string, targetDir: string): Ps1Result {
  let stdout = '';
  try {
    stdout = child_process.execFileSync(
      'powershell.exe',
      [
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', PS1_PATH,
        '-MessageId', messageId,
        '-TargetDir', targetDir,
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `PS1 spawn failed: ${msg}`, saved: [] };
  }

  try {
    return JSON.parse(stdout.trim()) as Ps1Result;
  } catch {
    return { error: 'PS1 output was not valid JSON', saved: [] };
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Save all qualifying attachments for a single Outlook message to the vault,
 * then index them as `documents` rows and record them in `outlook_attachment_log`.
 *
 * Idempotent: messages whose attachments are already in the log are skipped.
 * Gracefully no-ops when Outlook is not running, the message is not found, or
 * the vault root is not configured.
 */
export async function saveMessageAttachments(
  message: OutlookMessage,
  orgLinks: OrgLink[],
): Promise<void> {
  if (!message.has_attachments) return;

  // Parse attachment metadata from the message row.
  let attMeta: AttachmentMeta[] = [];
  try {
    attMeta = JSON.parse(message.attachments_meta) as AttachmentMeta[];
    if (!Array.isArray(attMeta)) attMeta = [];
  } catch {
    attMeta = [];
  }

  // Pre-filter: are there any attachments worth saving?
  const qualifying = attMeta.filter(shouldSaveAttachment);
  if (qualifying.length === 0) return;

  // Idempotency: skip attachments already logged.
  const toSave = qualifying.filter(
    (att) => !logLookupStmt.get(message.internet_message_id, att.name),
  );
  if (toSave.length === 0) return;

  if (!isMastercontrolRootConfigured()) {
    console.warn('[outlookAttachment] mastercontrol_root not configured — skipping attachment save');
    return;
  }
  const root = getMastercontrolRoot();

  // Resolve the vault root to an absolute path for containment checks.
  const safeRoot = path.resolve(root);

  // Pick primary org link (highest confidence = first after ORDER BY DESC in query).
  const primaryOrg = orgLinks.length > 0 ? orgLinks[0] : null;

  const targetDir = buildTargetDir(root, message, primaryOrg);

  // Spawn the PS1 script.
  const result = runAttachmentPs1(message.internet_message_id, targetDir);

  if (result.error) {
    console.warn(`[outlookAttachment] PS1 error for message ${message.id}: ${result.error}`);
    return;
  }

  if (!result.saved || result.saved.length === 0) return;

  // Process each saved file.
  for (const saved of result.saved) {
    // Verify the saved path is inside mastercontrol_root (containment check).
    const absPath = path.resolve(saved.path);
    if (!absPath.startsWith(safeRoot + path.sep)) {
      console.warn('[outlookAttachment] saved file escaped vault root — skipping index');
      continue;
    }

    // Relative vault path (stored in DB, not absolute).
    const relativePath = absPath.slice(safeRoot.length + 1).replace(/\\/g, '/');

    // Confirm the corresponding attachment is in the qualifying list.
    const meta = toSave.find((a) => a.name === saved.name);
    if (!meta) continue;

    // Create a documents row if org-linked.
    let docId: number | null = null;
    if (primaryOrg) {
      try {
        const docRow = docInsertStmt.get(
          primaryOrg.org_id,
          saved.name,
          relativePath,
        );
        docId = docRow?.id ?? null;
      } catch (err) {
        // Non-fatal: log and continue — the file is saved even if indexing fails.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[outlookAttachment] documents insert failed for '${saved.safe_name}': ${msg}`);
      }
    }

    // Record in the attachment log (idempotency anchor).
    try {
      logInsertStmt.run(
        message.internet_message_id,
        saved.name,
        relativePath,
        docId,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[outlookAttachment] log insert failed for '${saved.safe_name}': ${msg}`);
    }
  }
}

