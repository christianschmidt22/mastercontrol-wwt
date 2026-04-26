/**
 * workvault.service.ts — Phase 2 / Step 4 (R-025)
 *
 * Provides safe, auditable writes of user-authored notes to the WorkVault
 * directory on disk.
 *
 * Exports:
 *   writeNote(note) — write a note to WorkVault and update the DB row.
 *
 * Security guarantees (R-025):
 *   1. Server-derived filename only — the destination path is computed from
 *      `note.id` and a server-side slug of `note.content`. User-supplied
 *      content never directly controls the path.
 *   2. Safe-path containment — the resolved destination is verified to be a
 *      strict descendant of `workvault_root` using the same resolve+startsWith
 *      pattern as `resolveSafePath` in lib/safePath.ts. We do this manually
 *      here because `resolveSafePath` requires the file to already exist
 *      (it calls `fs.realpathSync`), and we are writing a new file.
 *   3. Collision refusal — if another note row already owns the computed path,
 *      the write is rejected with a descriptive error rather than silently
 *      overwriting.
 *
 * DB access note:
 *   Stream A (ingest pipeline) is concurrently editing note.model.ts, so we
 *   cannot add methods there without a file-collision risk. The two prepared
 *   statements needed here (`getByPath`, `updateSourcePath`) are defined
 *   inline below as module-level constants using the shared `db` singleton.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { db } from '../db/database.js';
import { settingsModel } from '../models/settings.model.js';

// ---------------------------------------------------------------------------
// Inline prepared statements (file-collision avoidance — see module doc)
// ---------------------------------------------------------------------------

/**
 * Look up a note row by its `source_path`. Used to detect ownership conflicts
 * before writing a file. Returns the first matching row or undefined.
 */
const getByPathStmt = db.prepare<[string], { id: number }>(
  'SELECT id FROM notes WHERE source_path = ? LIMIT 1',
);

/**
 * Update the `source_path` and `file_mtime` on a note row after a successful
 * file write. This keeps the DB index in sync with the on-disk state.
 */
const updateSourcePathStmt = db.prepare<[string, string, number]>(
  'UPDATE notes SET source_path = ?, file_mtime = ? WHERE id = ?',
);

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

/**
 * Derive a URL/filename-safe slug from the first 40 characters of content.
 * Replaces any run of non-alphanumeric characters with a single dash, then
 * lowercases and trims leading/trailing dashes.
 */
function deriveSlug(content: string): string {
  return content
    .slice(0, 40)
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// writeNote
// ---------------------------------------------------------------------------

/**
 * Write a user-authored note to WorkVault and update the DB row.
 *
 * @param note - The note to write. Must have already been persisted to the DB
 *   (so `note.id` is valid) and have a stable `file_id` (UUID assigned at
 *   creation time).
 * @returns The absolute path of the written file.
 * @throws If `workvault_root` is not configured, if the destination would
 *   escape the root, or if the path is already claimed by a different note.
 */
export async function writeNote(note: {
  id: number;
  organization_id: number;
  content: string;
  file_id: string;
}): Promise<string> {
  // Guard: workvault_root must be configured.
  const workvaultRoot = settingsModel.get('workvault_root');
  if (!workvaultRoot) {
    throw new Error('workvault_root not configured');
  }

  // Server-derived filename (R-025 guardrail 1).
  const slug = deriveSlug(note.content);
  const filename = `${note.id}-${slug}.md`;
  const dest = path.join(workvaultRoot, filename);

  // Safe-path containment check (R-025 guardrail 2 / R-024 pattern).
  // We resolve both paths and require the destination to be a strict
  // descendant (i.e. starts with root + separator). We do NOT call
  // resolveSafePath here because that function requires the file to already
  // exist (uses fs.realpathSync); we are creating a new file.
  const safeRoot = path.resolve(workvaultRoot);
  const safeDest = path.resolve(dest);
  if (!safeDest.startsWith(safeRoot + path.sep)) {
    throw new Error('safe-path-rejected: destination escapes workvault_root');
  }

  // Collision check (R-025 guardrail 3).
  // Reject if another note already owns this path.
  const existing = getByPathStmt.get(safeDest);
  if (existing !== undefined && existing.id !== note.id) {
    throw new Error(`write-rejected: path already owned by note ${existing.id}`);
  }

  // Write the file with YAML frontmatter prefix.
  const frontmatter = `---\nfile_id: ${note.file_id}\n---\n\n`;
  fs.writeFileSync(safeDest, frontmatter + note.content, 'utf8');

  // Read back mtime and update the DB row.
  const mtime = fs.statSync(safeDest).mtime.toISOString();
  updateSourcePathStmt.run(safeDest, mtime, note.id);

  return safeDest;
}
