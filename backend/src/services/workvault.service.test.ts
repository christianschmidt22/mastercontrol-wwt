/**
 * workvault.service.test.ts — Phase 2 / Step 4 (R-025)
 *
 * Tests for writeNote() covering:
 *   - Happy path: correct frontmatter + content on disk; DB row updated.
 *   - Slug derivation: special chars and unicode produce a clean slug.
 *   - Safe-path containment: destination always stays inside workvault_root
 *     (server-derived filename makes escape via content impossible — test
 *     confirms this).
 *   - Collision: a path already owned by a different note causes rejection
 *     without writing the file.
 *   - No workvault_root configured: throws a clear error, writes nothing.
 *
 * Setup notes:
 *   - setup.ts (globalSetup) runs initSchema() and wraps each test in a
 *     savepoint, so DB state is isolated per test without teardown work here.
 *   - workvault_root is set via settingsModel.set() in beforeEach so the
 *     in-memory DB setting reflects the current tmp dir.
 *   - settingsModel is NOT mocked — we want the real DB round-trip so that
 *     getByPath / updateSourcePath also see a consistent state.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { db } from '../db/database.js';
import { settingsModel } from '../models/settings.model.js';

// Import the SUT after setup.ts has run (guaranteed by vitest's setupFiles).
import { writeNote } from './workvault.service.js';

// ---------------------------------------------------------------------------
// Tmp directory management
// ---------------------------------------------------------------------------

const tmpRoots: string[] = [];

function makeTmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-wv-'));
  tmpRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpRoots) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Insert a minimal note row and return its id.
 * Uses a raw prepared statement to avoid depending on note.model.ts
 * (Stream A owns that file).
 */
function insertNote(orgId: number, content: string, sourcePath: string | null = null): number {
  const stmt = db.prepare<[number, string, string | null], { id: number }>(
    `INSERT INTO notes (organization_id, content, role, confirmed, source_path)
     VALUES (?, ?, 'user', 1, ?)
     RETURNING id`,
  );
  const row = stmt.get(orgId, content, sourcePath);
  if (!row) throw new Error('insertNote: RETURNING id came back empty');
  return row.id;
}

/**
 * Insert a minimal org row and return its id.
 */
function insertOrg(name: string): number {
  const stmt = db.prepare<[string], { id: number }>(
    `INSERT INTO organizations (name, type) VALUES (?, 'customer') RETURNING id`,
  );
  const row = stmt.get(name);
  if (!row) throw new Error('insertOrg: RETURNING id came back empty');
  return row.id;
}

/**
 * Read the source_path and file_mtime for a note row.
 */
function getNoteRow(id: number): { source_path: string | null; file_mtime: string | null } {
  const row = db
    .prepare<[number], { source_path: string | null; file_mtime: string | null }>(
      'SELECT source_path, file_mtime FROM notes WHERE id = ?',
    )
    .get(id);
  if (!row) throw new Error(`getNoteRow: note ${id} not found`);
  return row;
}

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

let tmpRoot: string;
let orgId: number;

beforeEach(() => {
  tmpRoot = makeTmpRoot();
  settingsModel.set('workvault_root', tmpRoot);
  orgId = insertOrg('ACME Corp');
});

afterEach(() => {
  // Remove the workvault_root setting between tests so the "not configured"
  // test isn't accidentally passing because a prior test set it.
  settingsModel.remove('workvault_root');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeNote()', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  it('writes the file with correct frontmatter prefix and content, and updates DB', async () => {
    const content = 'Meeting with ACME about Q3 renewal';
    const noteId = insertNote(orgId, content);
    const fileId = 'test-file-id-1234';

    const destPath = await writeNote({ id: noteId, organization_id: orgId, content, file_id: fileId });

    // File must exist inside the tmp root.
    expect(fs.existsSync(destPath)).toBe(true);

    // File content: frontmatter prefix followed by the note content.
    const written = fs.readFileSync(destPath, 'utf8');
    expect(written).toBe(`---\nfile_id: ${fileId}\n---\n\n${content}`);

    // DB row must have source_path and file_mtime populated.
    const row = getNoteRow(noteId);
    expect(row.source_path).toBe(destPath);
    expect(row.file_mtime).toBeTruthy();
    // mtime should be a valid ISO 8601 timestamp.
    expect(() => new Date(row.file_mtime!)).not.toThrow();

    // Returned path must be inside the tmp root.
    expect(destPath.startsWith(tmpRoot)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Slug derivation
  // -------------------------------------------------------------------------
  it('produces a clean lowercase slug from content with special chars', async () => {
    // Content with various non-alphanumeric characters including unicode.
    const content = '  !! Hello, World! — Q3 Review & ACME Corp (2025)... more text here';
    const noteId = insertNote(orgId, content);
    const fileId = 'slug-test-file-id';

    const destPath = await writeNote({ id: noteId, organization_id: orgId, content, file_id: fileId });

    const filename = path.basename(destPath);
    // Filename must match `<id>-<slug>.md` pattern.
    expect(filename).toMatch(/^\d+-[a-z0-9][a-z0-9-]*[a-z0-9]\.md$/);

    // No leading or trailing dashes in the slug portion.
    const slugPart = filename.replace(/^\d+-/, '').replace(/\.md$/, '');
    expect(slugPart).not.toMatch(/^-|-$/);

    // Slug must be all lowercase alphanumeric + dashes.
    expect(slugPart).toMatch(/^[a-z0-9-]+$/);
  });

  it('slug is bounded at 40 characters of input content', async () => {
    // Content where first 40 chars are entirely alphanumeric.
    const content = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD' + 'extra text that should not appear in slug';
    const noteId = insertNote(orgId, content);
    const fileId = 'slug-length-test';

    const destPath = await writeNote({ id: noteId, organization_id: orgId, content, file_id: fileId });

    const filename = path.basename(destPath);
    const slugPart = filename.replace(/^\d+-/, '').replace(/\.md$/, '');
    // The slug is derived from content.slice(0, 40) = 40 chars of alphanumeric,
    // so the slug should not exceed 40 chars.
    expect(slugPart.length).toBeLessThanOrEqual(40);
  });

  // -------------------------------------------------------------------------
  // Safe-path containment
  // -------------------------------------------------------------------------
  it('destination path always stays inside workvault_root regardless of note content', async () => {
    // Since the filename is entirely server-derived (id + slug from content),
    // even content that looks like a path traversal attack cannot escape the root.
    const maliciousContent = '../../../etc/passwd this would be a bad filename';
    const noteId = insertNote(orgId, maliciousContent);
    const fileId = 'safe-path-test-id';

    const destPath = await writeNote({
      id: noteId,
      organization_id: orgId,
      content: maliciousContent,
      file_id: fileId,
    });

    // File must exist and be inside the tmp root.
    expect(fs.existsSync(destPath)).toBe(true);
    expect(path.resolve(destPath).startsWith(path.resolve(tmpRoot) + path.sep)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Collision refusal
  // -------------------------------------------------------------------------
  it('throws and does NOT write when the computed path is already owned by a different note', async () => {
    const content = 'Collision test note content';
    const noteId = insertNote(orgId, content);

    // Write the note once legitimately so the path is claimed.
    const firstPath = await writeNote({
      id: noteId,
      organization_id: orgId,
      content,
      file_id: 'first-file-id',
    });

    // Insert a second note with the SAME source_path already set in the DB,
    // simulating a situation where another note already owns that path.
    const otherNoteId = insertNote(orgId, 'different content', firstPath);

    // Now try to write from a third note that would produce the same filename.
    // We need a note whose id and slug produce a path that collides.
    // We can't easily control the path from outside (server-derived), so
    // we directly pre-insert a note with source_path = the path we know the
    // NEW note would produce, with a different note id.
    //
    // Strategy: create a note, compute what path it WOULD get, pre-claim that
    // path in the DB with yet another note, then attempt writeNote.
    const newContent = 'Another distinct note to trigger collision';
    const newNoteId = insertNote(orgId, newContent);

    // Compute the expected destination for newNoteId.
    const slug = newContent
      .slice(0, 40)
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()
      .replace(/^-+|-+$/g, '');
    const expectedFilename = `${newNoteId}-${slug}.md`;
    const expectedDest = path.join(tmpRoot, expectedFilename);

    // Pre-claim that path with a different note id (the 'other' note we made).
    db.prepare('UPDATE notes SET source_path = ? WHERE id = ?').run(expectedDest, otherNoteId);

    // writeNote should reject because expectedDest is owned by otherNoteId.
    await expect(
      writeNote({ id: newNoteId, organization_id: orgId, content: newContent, file_id: 'new-file-id' }),
    ).rejects.toThrow(`write-rejected: path already owned by note ${otherNoteId}`);

    // The file must NOT have been created.
    expect(fs.existsSync(expectedDest)).toBe(false);
  });

  it('does NOT throw when re-writing to a path already owned by the SAME note', async () => {
    const content = 'Idempotent re-write test';
    const noteId = insertNote(orgId, content);

    // First write.
    const firstPath = await writeNote({
      id: noteId,
      organization_id: orgId,
      content,
      file_id: 'idem-file-id',
    });

    // Second write — same note, same path. Should succeed.
    await expect(
      writeNote({ id: noteId, organization_id: orgId, content, file_id: 'idem-file-id' }),
    ).resolves.toBe(firstPath);
  });

  // -------------------------------------------------------------------------
  // workvault_root not configured
  // -------------------------------------------------------------------------
  it('throws a clear error and writes nothing when workvault_root is not configured', async () => {
    // afterEach removes the setting, but this test wants it gone NOW.
    settingsModel.remove('workvault_root');

    const content = 'Some note content';
    const noteId = insertNote(orgId, content);

    await expect(
      writeNote({ id: noteId, organization_id: orgId, content, file_id: 'no-root-file-id' }),
    ).rejects.toThrow('workvault_root not configured');

    // No file should have been written anywhere in the tmp root.
    // (tmpRoot still exists from beforeEach; it should be empty.)
    const files = fs.readdirSync(tmpRoot);
    expect(files).toHaveLength(0);
  });
});
