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
import { noteModel } from '../models/note.model.js';
import { noteMentionModel } from '../models/noteMention.model.js';
import { ingestSourceModel } from '../models/ingestSource.model.js';
import { resolveSafePath } from '../lib/safePath.js';
import {
  clearOrgCache,
  extractPrimaryOrgCandidates,
  upsertMentionCandidates,
  type ExtractedOrgMention,
} from './mention.service.js';
import { HttpError } from '../middleware/errorHandler.js';

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
      const primary = await resolvePrimaryOrg(body, sourceId, safePath);
      if (!primary) {
        result.errors += 1;
        continue;
      }

      try {
        const note = noteModel.createImported({
          organization_id: primary.orgId,
          content: body,
          source_path: safePath,
          file_mtime: fileMtimeIso,
          file_id: fileId,
          content_sha256: contentSha256,
        });
        result.inserted += 1;

        // Trigger mention extraction (best-effort — errors logged, not thrown).
        upsertCrossOrgMentions(note.id, primary.candidates, primary.orgId);
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
        const primary = await resolvePrimaryOrg(body, sourceId, safePath);
        if (!primary) {
          result.errors += 1;
          continue;
        }

        noteModel.updateByIngest(
          existing.id,
          body,
          contentSha256,
          fileMtimeIso,
          primary.orgId,
        );
        result.updated += 1;
        upsertCrossOrgMentions(existing.id, primary.candidates, primary.orgId);
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
// Per-error retry
// ---------------------------------------------------------------------------

export interface RetryResult {
  resolved: boolean;
  /** True when the file no longer exists at the error path. */
  path_not_found: boolean;
}

/**
 * Retry a single ingest error by re-scanning the specific file associated
 * with the error row.
 *
 * - Returns `{ resolved: true, path_not_found: false }` on a successful
 *   single-file scan. The error row is deleted.
 * - Returns `{ resolved: true, path_not_found: true }` if the file no longer
 *   exists on disk. The error row is deleted (treat as resolved).
 * - Throws an HttpError(404) if the error row doesn't exist.
 * - On a new scan failure the original error is preserved and the function
 *   rethrows so the caller can surface a 500.
 */
export async function retrySingleError(errorId: number): Promise<RetryResult> {
  const errRow = ingestSourceModel.getError(errorId);
  if (!errRow) {
    throw new HttpError(404, `Ingest error ${errorId} not found`);
  }

  const source = ingestSourceModel.get(errRow.source_id);
  if (!source) {
    throw new HttpError(404, `Source ${errRow.source_id} for error ${errorId} not found`);
  }

  // If the file no longer exists, mark the error resolved.
  if (!fs.existsSync(errRow.path)) {
    ingestSourceModel.deleteError(errorId);
    return { resolved: true, path_not_found: true };
  }

  // Validate path is inside root before scanning.
  try {
    resolveSafePath(errRow.path, source.root_path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`safe-path-rejected for retry: ${msg}`);
  }

  // Run a single-file scan by wrapping the file in a minimal ScanResult
  // accumulator. We don't walk the whole directory — only re-process this file.
  const singleResult = await scanSingleFile({
    sourceId: source.id,
    rootPath: source.root_path,
    filePath: errRow.path,
  });

  if (singleResult.errors === 0) {
    // Success — delete the error row.
    ingestSourceModel.deleteError(errorId);
    return { resolved: true, path_not_found: false };
  }

  // Scan still produced an error. Keep the original error row and throw.
  throw new Error('Single-file rescan still produced an error — check ingest_errors for details');
}

// ---------------------------------------------------------------------------
// Single-file scan (shared by scanWorkvault per-file loop and retrySingleError)
// ---------------------------------------------------------------------------

interface SingleFileScanOptions {
  sourceId: number;
  rootPath: string;
  filePath: string;
}

/**
 * Process exactly one file through the ingest pipeline.
 * Returns a ScanResult summarising what happened (errors > 0 means the file
 * was not successfully processed).
 *
 * This is intentionally kept private to this module; external callers use
 * scanWorkvault or retrySingleError.
 */
async function scanSingleFile(opts: SingleFileScanOptions): Promise<ScanResult> {
  const { sourceId, rootPath, filePath } = opts;
  const result: ScanResult = {
    files_scanned: 1,
    inserted: 0,
    updated: 0,
    touched: 0,
    tombstoned: 0,
    conflicts: 0,
    errors: 0,
  };

  // Validate path.
  let safePath: string;
  try {
    safePath = resolveSafePath(filePath, rootPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ingestSourceModel.recordError(sourceId, filePath, `safe-path-rejected: ${msg}`);
    result.errors += 1;
    return result;
  }

  // Read.
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(safePath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ingestSourceModel.recordError(sourceId, safePath, `read-failed: ${msg}`);
    result.errors += 1;
    return result;
  }

  // Stat.
  let mtime: Date;
  try {
    mtime = fs.statSync(safePath).mtime;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ingestSourceModel.recordError(sourceId, safePath, `stat-failed: ${msg}`);
    result.errors += 1;
    return result;
  }

  // Frontmatter.
  const { fileId: parsedFileId, body, raw } = parseFrontmatter(fileContent);
  let fileId = parsedFileId;

  if (!fileId) {
    fileId = crypto.randomUUID();
    try {
      stampFileId(safePath, body, fileId, raw);
      mtime = fs.statSync(safePath).mtime;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ingestSourceModel.recordError(sourceId, safePath, `frontmatter-write-failed: ${msg}`);
      result.errors += 1;
      return result;
    }
  }

  const contentSha256 = sha256(body);
  const fileMtimeIso = mtime.toISOString();

  const existing = noteModel.getByFileId(fileId);

  if (!existing) {
    const primary = await resolvePrimaryOrg(body, sourceId, safePath);
    if (!primary) {
      result.errors += 1;
      return result;
    }

    try {
      const note = noteModel.createImported({
        organization_id: primary.orgId,
        content: body,
        source_path: safePath,
        file_mtime: fileMtimeIso,
        file_id: fileId,
        content_sha256: contentSha256,
      });
      result.inserted += 1;
      upsertCrossOrgMentions(note.id, primary.candidates, primary.orgId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ingestSourceModel.recordError(sourceId, safePath, `insert-failed: ${msg}`);
      result.errors += 1;
    }
    return result;
  }

  const dbLastSeen = existing.last_seen_at ? new Date(existing.last_seen_at) : null;
  const mtimeAdvanced = dbLastSeen === null || mtime > dbLastSeen;

  if (mtimeAdvanced) {
    try {
      const primary = await resolvePrimaryOrg(body, sourceId, safePath);
      if (!primary) {
        result.errors += 1;
        return result;
      }

      noteModel.updateByIngest(
        existing.id,
        body,
        contentSha256,
        fileMtimeIso,
        primary.orgId,
      );
      result.updated += 1;
      upsertCrossOrgMentions(existing.id, primary.candidates, primary.orgId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ingestSourceModel.recordError(sourceId, safePath, `update-failed: ${msg}`);
      result.errors += 1;
    }
    return result;
  }

  if (existing.content_sha256 === contentSha256) {
    try {
      noteModel.touchLastSeenAt(existing.id);
      result.touched += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ingestSourceModel.recordError(sourceId, safePath, `touch-failed: ${msg}`);
      result.errors += 1;
    }
    return result;
  }

  // Conflict.
  ingestSourceModel.recordError(sourceId, safePath, 'sha256 mismatch at unchanged mtime');
  try {
    noteModel.createConflict(existing, body, contentSha256, fileMtimeIso);
    result.conflicts += 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ingestSourceModel.recordError(sourceId, safePath, `conflict-insert-failed: ${msg}`);
    result.errors += 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PrimaryOrgResolution {
  orgId: number;
  candidates: ExtractedOrgMention[];
}

async function resolvePrimaryOrg(
  content: string,
  sourceId: number,
  filePath: string,
): Promise<PrimaryOrgResolution | null> {
  try {
    const { primary, mentions } = await extractPrimaryOrgCandidates(content);
    if (!primary) {
      ingestSourceModel.recordError(
        sourceId,
        filePath,
        'primary-org-not-found: AI extraction returned no matching organization',
      );
      return null;
    }
    return { orgId: primary.org.id, candidates: mentions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ingestSourceModel.recordError(sourceId, filePath, `primary-org-extraction-failed: ${msg}`);
    return null;
  }
}

function upsertCrossOrgMentions(
  noteId: number,
  candidates: ExtractedOrgMention[],
  primaryOrgId: number,
): void {
  noteMentionModel.deleteByNoteAndSource(noteId, 'ai_auto');
  upsertMentionCandidates(
    noteId,
    candidates.filter((candidate) => candidate.org.id !== primaryOrgId),
  );
}
