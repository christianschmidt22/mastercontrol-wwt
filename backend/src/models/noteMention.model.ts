/**
 * noteMention.model.ts
 *
 * Prepared-statement model for the `note_mentions` table (schema.sql / migration
 * 003_schema_harden.sql adds `source` TEXT NOT NULL DEFAULT 'manual' and
 * `confidence` REAL columns).
 *
 * Source values (enforced at the model layer per phase-2 plan § Step 2):
 *   'manual'       — user-authored (future UI feature)
 *   'ai_auto'      — inserted by mention.service.ts after AI extraction
 *   'agent_insight'— inserted by the record_insight flow
 */

import { db } from '../db/database.js';
import { z } from 'zod';

export const MentionSourceEnum = z.enum(['manual', 'ai_auto', 'agent_insight']);
export type MentionSource = z.infer<typeof MentionSourceEnum>;

export interface NoteMentionRow {
  note_id: number;
  mentioned_org_id: number;
  source: MentionSource;
  confidence: number | null;
}

export interface NoteMentionUpsertInput {
  note_id: number;
  mentioned_org_id: number;
  source: MentionSource;
  confidence?: number | null;
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

const listByNoteStmt = db.prepare<[number], NoteMentionRow>(
  `SELECT note_id, mentioned_org_id, source, confidence
   FROM note_mentions WHERE note_id = ?`,
);

/**
 * Upsert a mention row. On conflict (same note_id + mentioned_org_id), we
 * update source and confidence so a re-scan upgrades the confidence score
 * rather than duplicating the row.
 *
 * note_mentions schema (from schema.sql):
 *   note_id INTEGER NOT NULL REFERENCES notes(id),
 *   mentioned_org_id INTEGER NOT NULL REFERENCES organizations(id),
 *   PRIMARY KEY (note_id, mentioned_org_id)
 */
const upsertStmt = db.prepare<[number, number, MentionSource, number | null]>(
  `INSERT INTO note_mentions (note_id, mentioned_org_id, source, confidence)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(note_id, mentioned_org_id)
   DO UPDATE SET source = excluded.source, confidence = excluded.confidence`,
);

const deleteByNoteStmt = db.prepare<[number]>(
  `DELETE FROM note_mentions WHERE note_id = ?`,
);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const noteMentionModel = {
  /** Return all mention rows for a note, ordered by insertion. */
  listByNote(noteId: number): NoteMentionRow[] {
    return listByNoteStmt.all(noteId);
  },

  /**
   * Upsert a mention.
   * Validates `source` against the enum at the model layer (per plan).
   * Throws if source is not a valid value.
   */
  upsert(input: NoteMentionUpsertInput): void {
    // Model-layer enforcement (plan § Step 2 — SQLite can't add CHECK to
    // existing columns via ALTER TABLE, so we enforce here).
    MentionSourceEnum.parse(input.source);
    upsertStmt.run(
      input.note_id,
      input.mentioned_org_id,
      input.source,
      input.confidence ?? null,
    );
  },

  /** Remove all mention rows for a note (used before re-extraction). */
  deleteByNote(noteId: number): void {
    deleteByNoteStmt.run(noteId);
  },
};
