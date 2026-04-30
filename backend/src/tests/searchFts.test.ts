/**
 * searchFts.test.ts
 *
 * Verifies that migration 027_notes_fts.sql correctly creates the FTS5
 * virtual table and triggers, and that the FTS5 MATCH query used by
 * handleSearchNotes returns correct results.
 *
 * Uses the shared in-memory DB bootstrapped by src/test/setup.ts (which
 * calls initSchema / runMigrations, including 027_notes_fts.sql).
 */

import { describe, it, expect } from 'vitest';
import { db } from '../db/database.js';
import { noteModel } from '../models/note.model.js';
import { makeOrg } from '../test/factories.js';

// ---------------------------------------------------------------------------
// Helper: run an FTS5 MATCH query directly against notes_fts
// ---------------------------------------------------------------------------

function ftsDirect(query: string, orgId?: number | null): Array<{ id: number; content: string }> {
  const rows = db.prepare<[string], { id: number; content: string }>(
    `SELECT n.id, n.content
     FROM notes_fts f
     JOIN notes n ON n.id = f.rowid
     WHERE notes_fts MATCH ?
     ORDER BY rank`,
  ).all(query);
  if (orgId != null) {
    return rows.filter((r) => {
      const note = noteModel.get(r.id);
      return note?.organization_id === orgId;
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notes_fts — FTS5 virtual table', () => {
  it('returns a note that contains the search keyword', () => {
    const org = makeOrg({ name: 'FTS Org A' });
    noteModel.create({ organization_id: org.id, content: 'renewal discussion with FTS Org A' });

    const results = ftsDirect('renewal');
    const found = results.some((r) => r.content.includes('renewal discussion'));
    expect(found).toBe(true);
  });

  it('returns empty results for a keyword not present in any note', () => {
    const org = makeOrg({ name: 'FTS Org B' });
    noteModel.create({ organization_id: org.id, content: 'quarterly business review' });

    const results = ftsDirect('xyzzynonexistent');
    expect(results).toHaveLength(0);
  });

  it('supports phrase search with quoted terms', () => {
    const org = makeOrg({ name: 'FTS Org C' });
    noteModel.create({ organization_id: org.id, content: 'contract renewal upcoming next quarter' });
    noteModel.create({ organization_id: org.id, content: 'renewal is not upcoming this time' });

    const results = ftsDirect('"contract renewal"');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.content.includes('contract renewal'))).toBe(true);
    // The note without the phrase should not appear
    const hasNonPhrase = results.some((r) =>
      r.content === 'renewal is not upcoming this time',
    );
    expect(hasNonPhrase).toBe(false);
  });

  it('returns empty results on syntactically invalid query (guard behaviour)', () => {
    // FTS5 MATCH throws on empty or malformed queries; the handler wraps in try/catch.
    // Here we just verify the DB itself throws so we know the guard is needed.
    expect(() => {
      db.prepare(`SELECT * FROM notes_fts WHERE notes_fts MATCH ?`).all('');
    }).toThrow();
  });

  it('stays in sync after a note UPDATE (trigger coverage)', () => {
    const org = makeOrg({ name: 'FTS Org D' });
    const note = noteModel.create({
      organization_id: org.id,
      content: 'initial content before update',
    });

    // Before update — old term should be findable
    expect(ftsDirect('initial').some((r) => r.id === note.id)).toBe(true);

    // Update the note content via raw SQL to test the trigger directly
    db.prepare(`UPDATE notes SET content = ? WHERE id = ?`).run(
      'updated content after trigger',
      note.id,
    );

    // Old term should no longer match
    const afterOld = ftsDirect('initial');
    expect(afterOld.some((r) => r.id === note.id)).toBe(false);

    // New term should match
    const afterNew = ftsDirect('trigger');
    expect(afterNew.some((r) => r.id === note.id)).toBe(true);
  });

  it('stays in sync after a note DELETE (trigger coverage)', () => {
    const org = makeOrg({ name: 'FTS Org E' });
    const note = noteModel.create({
      organization_id: org.id,
      content: 'uniquekeyword12345 in this note',
    });

    // Confirm it's indexed
    expect(ftsDirect('uniquekeyword12345').some((r) => r.id === note.id)).toBe(true);

    // Delete the note directly to exercise the delete trigger
    db.prepare(`DELETE FROM notes WHERE id = ?`).run(note.id);

    // Should no longer be in FTS index
    const after = ftsDirect('uniquekeyword12345');
    expect(after.some((r) => r.id === note.id)).toBe(false);
  });

  it('scopes results by org_id when provided', () => {
    const orgA = makeOrg({ name: 'Scope Org A' });
    const orgB = makeOrg({ name: 'Scope Org B' });
    noteModel.create({ organization_id: orgA.id, content: 'scoped keyword result' });
    noteModel.create({ organization_id: orgB.id, content: 'scoped keyword result' });

    const onlyA = ftsDirect('scoped', orgA.id);
    expect(onlyA.length).toBeGreaterThanOrEqual(1);
    const allFromA = onlyA.every((r) => {
      const note = noteModel.get(r.id);
      return note?.organization_id === orgA.id;
    });
    expect(allFromA).toBe(true);
  });
});
