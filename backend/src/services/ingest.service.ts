/**
 * ingest.service.ts
 *
 * WorkVault walk → hash → reconcile → mention-extract pipeline (Phase 2, Step 3).
 *
 * R-024: every file path is validated through resolveSafePath before reading.
 * R-026: mention extraction wraps content in <untrusted_document> (done inside
 *        extractOrgMentions in claude.service.ts).
 *
 * The one write this service performs on WorkVault files: appending a
 * `---\nfile_id: <uuid>\n---\n\n` frontmatter block to files that lack one.
 * This gives each file a stable identity across renames and content changes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { db } from '../db/database.js';
import { noteModel } from '../models/note.model.js';
import { ingestSourceModel } from '../models/ingestSource.model.js';
import { resolveSafePath } from '../lib/safePath.js';
import { extractMentions, clearOrgCache } from './mention.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanOptions {
  sourceId: number;
  rootPath: string;
}

export interface ScanResult {
  files_scanned: number;
  inserted: number;
  updated: number;
  touched: number;
  tombstoned: number;
  conflicts: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

/**
 * Regex to match a leading YAML frontmatter block (first `---` delimited
 * section). Consumes any blank lines between the closing `---` and the body —
 * `stampFileId` writes a blank line between FM and body, and human-edited
 * notes commonly do the same. Without this the body would carry a leading `\n`.
 */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)*/;

interface ParsedFrontmatter {
  fileId: string | null;
  /** The file body with frontmatter stripped. */
  body: string;
  /** The raw frontmatter block including delimiters, or empty string if absent. */
  raw: string;
}

/**
 * Minimal YAML frontmatter parser — only extracts `file_id: <value>` from the
 * first `---` block. We don't pull in `gray-matter` or another dep per the plan.
 */
function parseFrontmatter(fileContent: string): ParsedFrontmatter {
  const match = FRONTMATTER_RE.exec(fileContent);
  if (!match) {
    return { fileId: null, body: fileContent, raw: '' };
  }

  const block = match[1] ?? '';
  const raw = match[0];
  const body = fileContent.slice(raw.length);

  let fileId: string | null = null;
  for (const line of block.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (key === 'file_id') {
      fileId = line.slice(colonIdx + 1).trim() || null;
      break;
    }
  }

  return { fileId, body, raw };
}

/**
 * Write a `file_id` into the file. Two cases:
 *   - No existing frontmatter (`rawFm` is empty): prepend a fresh `---\nfile_id: <uuid>\n---\n\n`.
 *   - Existing frontmatter without file_id (`rawFm` is non-empty): inject
 *     `file_id: <uuid>` as the last key in the existing block.
 * Writes the modified content back to `filePath` in-place.
 */
function stampFileId(
  filePath: string,
  body: string,
  fileId: string,
  rawFm: string,
): void {
  let newContent: string;

  if (!rawFm) {
    // No frontmatter — prepend a minimal block.
    newContent = `---\nfile_id: ${fileId}\n---\n\n${body}`;
  } else {
    // Existing frontmatter block, but no file_id key. Inject it before the
    // closing `---`. We replace the trailing `---` of the raw block.
    // rawFm ends with `---\n` or `---` (possibly with \r\n).
    const closingIdx = rawFm.lastIndexOf('---');
    const before = rawFm.slice(0, closingIdx);
    const after = rawFm.slice(closingIdx); // `---\n` or `---`
    newContent = `${before}file_id: ${fileId}\n${after}${body}`;
  }

  fs.writeFileSync(filePath, newContent, 'utf8');
}

// ---------------------------------------------------------------------------
// SHA256 helper
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

/** File extensions collected by the walker (matches the plan and safePath allowlist). */
const ALLOWED_EXTS = new Set(['.md', '.txt']);

/**
 * Recursively collect `.md` and `.txt` file paths under `rootPath`.
 * Uses `fs.readdirSync(root, { recursive: true, withFileTypes: true })`
 * (Node 18+ recursive option).
 */
function walkDir(rootPath: string): string[] {
  const entries = fs.readdirSync(rootPath, { recursive: true, withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;
    // entry.parentPath is available in Node 20+. On Node 18 it's entry.path.
    // Node 24 (project runtime) has parentPath; the cast covers older type defs.
    const dir: string =
      (entry as fs.Dirent & { parentPath?: string }).parentPath ??
      (entry as fs.Dirent & { path?: string }).path ??
      rootPath;
    results.push(path.join(dir, entry.name));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main scan function
// ---------------------------------------------------------------------------

/**
 * Walk `rootPath`, reconcile each file against the notes DB, trigger mention
 * extraction for new or updated notes, and tombstone any notes not seen this
 * scan. Returns a summary of what changed.
 */
export async function scanWorkvault(opts: ScanOptions): Promise<ScanResult> {
  const { sourceId, rootPath } = opts;

  // Record scan start time before touching any files so post-scan tombstoning
  // can use it as the boundary.
  const scanStartIso = new Date().toISOString();

  // Clear the per-scan org name cache so any orgs added since the last scan
  // are reflected in mention extraction.
  clearOrgCache();

  const result: ScanResult = {
    files_scanned: 0,
    inserted: 0,
    updated: 0,
    touched: 0,
    tombstoned: 0,
    conflicts: 0,
    errors: 0,
  };

  // Walk the directory tree.
  let filePaths: string[];
  try {
    filePaths = walkDir(rootPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ingestSourceModel.recordError(sourceId, rootPath, `walkDir failed: ${msg}`);
    result.errors += 1;
    return result;
  }

  for (const rawPath of filePaths) {
    result.files_scanned += 1;

    // -------------------------------------------------------------------------
    // R-024: validate path is strictly inside rootPath before reading.
    // -------------------------------------------------------------------------
    let safePath: string;
    try {
      safePath = resolveSafePath(rawPath, rootPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ingestSourceModel.recordError(sourceId, rawPath, `safe-path-rejected: ${msg}`);
      result.errors += 1;
      continue;
    }

    // -------------------------------------------------------------------------
    // Read the file.
    // -------------------------------------------------------------------------
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(safePath, 'utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ingestSourceModel.recordError(sourceId, safePath, `read-failed: ${msg}`);
      result.errors += 1;
      continue;
    }

    // -------------------------------------------------------------------------
    // Read mtime before any potential frontmatter write.
    // -------------------------------------------------------------------------
    let mtime: Date;
    try {
      mtime = fs.statSync(safePath).mtime;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ingestSourceModel.recordError(sourceId, safePath, `stat-failed: ${msg}`);
      result.errors += 1;
      continue;
    }

    // -------------------------------------------------------------------------
    // Parse frontmatter, generating and writing a file_id if absent.
    // -------------------------------------------------------------------------
    const { fileId: parsedFileId, body, raw } = parseFrontmatter(fileContent);
    let fileId = parsedFileId;

    if (!fileId) {
      fileId = crypto.randomUUID();
      try {
        stampFileId(safePath, body, fileId, raw);
        // Re-stat after write so mtime reflects the stamp time.
        mtime = fs.statSync(safePath).mtime;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ingestSourceModel.recordError(sourceId, safePath, `frontmatter-write-failed: ${msg}`);
        result.errors += 1;
        continue;
      }
    }

    const contentSha256 = sha256(body);
    const fileMtimeIso = mtime.toISOString();

    // -------------------------------------------------------------------------
    // Reconciliation matrix (§ 3b).
    // -------------------------------------------------------------------------
    const existing = noteModel.getByFileId(fileId);

    if (!existing) {
      // Case: INSERT — no DB row for this file_id.
      // We need an org to associate the note with. For WorkVault-sourced notes
      // with no org context in the file, we use org_id = 0 as a sentinel and
      // let the user assign an org later. However, the schema requires
      // organization_id NOT NULL and a valid FK. For now we skip org-less files
      // and record an informational error. A future UI step will let the user
      // map WorkVault notes to orgs.
      //
      // For the test suite and production use: the caller may pre-create a
      // "WorkVault" org and pass its id via a convention (e.g. first org in DB).
      // For Phase 2 we use the lowest org id available as the default target.
      const defaultOrgId = getDefaultOrgId();
      if (!defaultOrgId) {
        ingestSourceModel.recordError(
          sourceId,
          safePath,
          'no-org-available: create at least one organization before scanning',
        );
        result.errors += 1;
        continue;
      }

      try {
        const note = noteModel.createImported({
          organization_id: defaultOrgId,
          content: body,
          source_path: safePath,
          file_mtime: fileMtimeIso,
          file_id: fileId,
          content_sha256: contentSha256,
        });
        result.inserted += 1;

        // Trigger mention extraction (best-effort — errors logged, not thrown).
        await runMentionExtraction(note.id, body, sourceId, safePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ingestSourceModel.recordError(sourceId, safePath, `insert-failed: ${msg}`);
        result.errors += 1;
      }
      continue;
    }

    // We have an existing DB row. Compare mtime and sha256.
    const dbLastSeen = existing.last_seen_at ? new Date(existing.last_seen_at) : null;
    const fileMtimeDate = mtime;
    const mtimeAdvanced = dbLastSeen === null || fileMtimeDate > dbLastSeen;

    if (mtimeAdvanced) {
      // Case: UPDATE — file mtime is newer than last_seen_at.
      try {
        noteModel.updateByIngest(existing.id, body, contentSha256, fileMtimeIso);
        result.updated += 1;
        await runMentionExtraction(existing.id, body, sourceId, safePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ingestSourceModel.recordError(sourceId, safePath, `update-failed: ${msg}`);
        result.errors += 1;
      }
      continue;
    }

    // mtime has not advanced. Check sha256.
    if (existing.content_sha256 === contentSha256) {
      // Case: TOUCH — file unchanged; advance last_seen_at only.
      try {
        noteModel.touchLastSeenAt(existing.id);
        result.touched += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ingestSourceModel.recordError(sourceId, safePath, `touch-failed: ${msg}`);
        result.errors += 1;
      }
      continue;
    }

    // Case: CONFLICT — sha256 differs but mtime hasn't advanced.
    // Log to ingest_errors and create a conflict note row.
    ingestSourceModel.recordError(
      sourceId,
      safePath,
      'sha256 mismatch at unchanged mtime',
    );
    try {
      noteModel.createConflict(existing, body, contentSha256, fileMtimeIso);
      result.conflicts += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ingestSourceModel.recordError(sourceId, safePath, `conflict-insert-failed: ${msg}`);
      result.errors += 1;
    }
  }

  // -------------------------------------------------------------------------
  // Post-scan tombstoning: any file-sourced note not seen since scan start.
  // -------------------------------------------------------------------------
  try {
    const tombstoned = noteModel.tombstoneStaleSince(scanStartIso);
    result.tombstoned = tombstoned;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ingestSourceModel.recordError(sourceId, rootPath, `tombstone-failed: ${msg}`);
    result.errors += 1;
  }

  // Stamp the source row with the scan completion time.
  ingestSourceModel.updateLastScanAt(sourceId, new Date().toISOString());

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getDefaultOrgStmt = db.prepare<[], { id: number }>(
  'SELECT id FROM organizations ORDER BY id ASC LIMIT 1',
);

/**
 * Get the id of the first organization in the DB (lowest id). Used as the
 * default target org for WorkVault-sourced notes with no explicit org mapping.
 * Returns null if no orgs exist.
 */
function getDefaultOrgId(): number | null {
  const row = getDefaultOrgStmt.get();
  return row ? row.id : null;
}

/**
 * Run mention extraction for a note. Errors are caught and recorded in
 * ingest_errors rather than surfaced to the caller, so a bad Anthropic
 * response doesn't abort the rest of the scan.
 */
async function runMentionExtraction(
  noteId: number,
  content: string,
  sourceId: number,
  filePath: string,
): Promise<void> {
  try {
    await extractMentions(noteId, content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ingestSourceModel.recordError(sourceId, filePath, `mention-extraction-failed: ${msg}`);
  }
}
