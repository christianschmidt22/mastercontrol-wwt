/**
 * R-024: Safe path resolution for the Phase 2 `read_document` tool.
 *
 * Two exports:
 *   - `resolveSafePath(input, root, opts?)` — resolve `input` relative to
 *     `root`, follow symlinks, verify the result is a strict descendant of
 *     `root`, verify no symlink anywhere in the ancestry chain, and check the
 *     extension against an allowlist. Throws `Error('safe-path-rejected: …')`
 *     on any violation.
 *   - `enforceSizeLimit(absPath, maxBytes?)` — stat the file and throw if it
 *     exceeds the byte cap (default 1 MiB).
 *
 * These functions are pure (no DB, no HTTP) so they are easy to unit-test
 * (R-024 acceptance tests will cover: `../../../etc/passwd`, symlink outside
 * root, `.exe` extension, and normal `.md` pass-through).
 *
 * Phase 2 usage pattern in claude.service.ts:
 *   const abs = resolveSafePath(toolInput.path, workvaultRoot);
 *   enforceSizeLimit(abs);
 *   const content = readFileSync(abs, 'utf8');
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

const DEFAULT_ALLOWED_EXTENSIONS: ReadonlyArray<string> = ['.md', '.txt', '.pdf'];
const DEFAULT_MAX_BYTES = 1_048_576; // 1 MiB

export interface SafePathOptions {
  allowedExtensions?: string[];
}

/**
 * Resolve `input` to an absolute path inside `root`, applying all R-024 checks.
 *
 * Steps:
 *  1. `path.resolve(root, input)` — produce a candidate path.
 *  2. `fs.realpathSync` — follow symlinks (catches symlinks that *point*
 *     outside root even when the link file itself is inside root).
 *  3. Verify the resolved path starts with `root + path.sep` (strict
 *     descendant; rejects root itself and paths that merely share a prefix
 *     with root, e.g. `/vault_extra/…` vs `/vault/…`).
 *  4. Walk every ancestor segment and `lstatSync` each one — reject if any
 *     segment is a symlink (defense-in-depth on top of realpathSync).
 *  5. Check extension against `allowedExtensions`.
 *
 * Throws `Error('safe-path-rejected: <reason>')` on any violation.
 */
export function resolveSafePath(
  input: string,
  root: string,
  opts: SafePathOptions = {},
): string {
  const allowedExtensions = opts.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS;

  // Normalise root to an absolute path without trailing separator.
  const normRoot = path.resolve(root).replace(/[\\/]+$/, '');

  // Step 1: candidate before symlink resolution.
  const candidate = path.resolve(normRoot, input);

  // Step 2: resolve all symlinks in the chain. If the file doesn't exist yet
  // this will throw ENOENT — let it propagate as-is so callers can distinguish
  // "path is dangerous" from "file not found".
  let resolved: string;
  try {
    resolved = fs.realpathSync(candidate);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error('safe-path-rejected: file does not exist');
    }
    throw err;
  }

  // Normalize resolved path to use OS separator for comparison.
  const resolvedNorm = path.normalize(resolved);
  const rootBoundary = normRoot + path.sep;

  // Step 3: strict descendant check.
  if (!resolvedNorm.startsWith(rootBoundary)) {
    throw new Error(
      `safe-path-rejected: resolved path escapes root (root=${normRoot}, resolved=${resolvedNorm})`,
    );
  }

  // Step 4: walk ancestors inside root and reject any symlink segment.
  // We iterate from just inside root down to the resolved file.
  let cursor = resolvedNorm;
  while (cursor.length > normRoot.length) {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(cursor);
    } catch {
      // Path component doesn't exist; realpathSync would have caught this
      // above for the leaf, but a race could remove a directory mid-check.
      throw new Error(`safe-path-rejected: path component not found during ancestry check: ${cursor}`);
    }
    if (stat.isSymbolicLink()) {
      throw new Error(
        `safe-path-rejected: symlink found in ancestry chain at ${cursor}`,
      );
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break; // reached filesystem root, stop
    cursor = parent;
  }

  // Step 5: extension allowlist.
  const ext = path.extname(resolvedNorm).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(
      `safe-path-rejected: extension '${ext}' not in allowlist (${allowedExtensions.join(', ')})`,
    );
  }

  return resolvedNorm;
}

/**
 * Throw if the file at `absPath` exceeds `maxBytes`.
 *
 * Caller must have already run `resolveSafePath` — this function does NOT
 * re-check path safety; it only checks size.
 */
export function enforceSizeLimit(absPath: string, maxBytes: number = DEFAULT_MAX_BYTES): void {
  const stat = fs.statSync(absPath);
  if (stat.size > maxBytes) {
    throw new Error(
      `safe-path-rejected: file size ${stat.size} bytes exceeds limit of ${maxBytes} bytes`,
    );
  }
}
