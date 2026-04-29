import { db } from '../db/database.js';

export type NoteProposalType =
  | 'customer_ask'
  | 'task_follow_up'
  | 'oem_mention'
  | 'internal_resource';

export type NoteProposalStatus = 'pending' | 'approved' | 'denied' | 'discussing';

interface NoteProposalRow {
  id: number;
  source_note_id: number;
  organization_id: number;
  project_id: number | null;
  contact_id: number | null;
  type: NoteProposalType;
  title: string;
  summary: string;
  evidence_quote: string;
  proposed_payload: string;
  confidence: number;
  status: NoteProposalStatus;
  discussion: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteProposal {
  id: number;
  source_note_id: number;
  organization_id: number;
  project_id: number | null;
  contact_id: number | null;
  type: NoteProposalType;
  title: string;
  summary: string;
  evidence_quote: string;
  proposed_payload: Record<string, unknown>;
  confidence: number;
  status: NoteProposalStatus;
  discussion: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteProposalInput {
  source_note_id: number;
  organization_id: number;
  project_id?: number | null;
  contact_id?: number | null;
  type: NoteProposalType;
  title: string;
  summary: string;
  evidence_quote: string;
  proposed_payload?: Record<string, unknown>;
  confidence?: number;
}

/** Patch shape for {@link noteProposalModel.replace}. Used by the
 *  "redo with feedback" flow to overwrite the LLM-extracted fields of an
 *  existing proposal without changing its id (and any audit ties). */
export interface NoteProposalReplaceInput {
  type: NoteProposalType;
  title: string;
  summary: string;
  evidence_quote: string;
  proposed_payload: Record<string, unknown>;
  confidence: number;
  contact_id?: number | null;
  project_id?: number | null;
}

function hydrate(row: NoteProposalRow): NoteProposal {
  return {
    ...row,
    proposed_payload: JSON.parse(row.proposed_payload) as Record<string, unknown>,
  };
}

const listByStatusStmt = db.prepare<[NoteProposalStatus, number], NoteProposalRow>(
  `SELECT * FROM note_proposals
   WHERE status = ?
   ORDER BY created_at DESC
   LIMIT ?`,
);

const getStmt = db.prepare<[number], NoteProposalRow>(
  'SELECT * FROM note_proposals WHERE id = ?',
);

const insertStmt = db.prepare<
  [number, number, number | null, number | null, NoteProposalType, string, string, string, string, number]
>(
  `INSERT INTO note_proposals
     (source_note_id, organization_id, project_id, contact_id, type, title, summary, evidence_quote, proposed_payload, confidence)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const replaceStmt = db.prepare<
  [NoteProposalType, string, string, string, string, number, number | null, number | null, number]
>(
  `UPDATE note_proposals
     SET type = ?,
         title = ?,
         summary = ?,
         evidence_quote = ?,
         proposed_payload = ?,
         confidence = ?,
         contact_id = ?,
         project_id = COALESCE(?, project_id),
         status = 'pending',
         discussion = NULL,
         updated_at = datetime('now')
   WHERE id = ?`,
);

const updateStatusStmt = db.prepare<[NoteProposalStatus, string | null, number]>(
  `UPDATE note_proposals
   SET status = ?, discussion = ?, updated_at = datetime('now')
   WHERE id = ?`,
);

const deleteByIdStmt = db.prepare<[number]>('DELETE FROM note_proposals WHERE id = ?');

const deleteBySourceNoteIfPendingStmt = db.prepare<[number]>(
  `DELETE FROM note_proposals WHERE source_note_id = ? AND status = 'pending'`,
);

export const noteProposalModel = {
  listByStatus(status: NoteProposalStatus, limit: number): NoteProposal[] {
    return listByStatusStmt.all(status, limit).map(hydrate);
  },

  get(id: number): NoteProposal | undefined {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  create(input: NoteProposalInput): NoteProposal {
    const result = insertStmt.run(
      input.source_note_id,
      input.organization_id,
      input.project_id ?? null,
      input.contact_id ?? null,
      input.type,
      input.title,
      input.summary,
      input.evidence_quote,
      JSON.stringify(input.proposed_payload ?? {}),
      input.confidence ?? 0.5,
    );
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },

  /** Overwrite an existing proposal's LLM-extracted fields. Resets the
   *  proposal to status='pending' and clears any prior discussion text so
   *  the user reviews the revised version fresh. Used by the "redo with
   *  feedback" flow. */
  replace(id: number, input: NoteProposalReplaceInput): NoteProposal | undefined {
    replaceStmt.run(
      input.type,
      input.title,
      input.summary,
      input.evidence_quote,
      JSON.stringify(input.proposed_payload),
      input.confidence,
      input.contact_id ?? null,
      input.project_id ?? null,
      id,
    );
    return this.get(id);
  },

  setStatus(
    id: number,
    status: NoteProposalStatus,
    discussion?: string | null,
  ): NoteProposal | undefined {
    updateStatusStmt.run(status, discussion ?? null, id);
    return this.get(id);
  },

  deleteById(id: number): boolean {
    return deleteByIdStmt.run(id).changes > 0;
  },

  /** Delete all pending proposals for a source note. Called after real LLM
   *  extraction succeeds to replace the initial triage placeholder. */
  deleteBySourceNoteIfPending(sourceNoteId: number): number {
    return deleteBySourceNoteIfPendingStmt.run(sourceNoteId).changes;
  },
};
