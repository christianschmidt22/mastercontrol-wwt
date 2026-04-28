import { db } from '../db/database.js';

export type NoteProposalType =
  | 'customer_ask'
  | 'task_follow_up'
  | 'project_update'
  | 'risk_blocker'
  | 'oem_mention'
  | 'customer_insight';

export type NoteProposalStatus = 'pending' | 'approved' | 'denied' | 'discussing';

interface NoteProposalRow {
  id: number;
  source_note_id: number;
  organization_id: number;
  project_id: number | null;
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
  type: NoteProposalType;
  title: string;
  summary: string;
  evidence_quote: string;
  proposed_payload?: Record<string, unknown>;
  confidence?: number;
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
  [number, number, number | null, NoteProposalType, string, string, string, string, number]
>(
  `INSERT INTO note_proposals
     (source_note_id, organization_id, project_id, type, title, summary, evidence_quote, proposed_payload, confidence)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const updateStatusStmt = db.prepare<[NoteProposalStatus, string | null, number]>(
  `UPDATE note_proposals
   SET status = ?, discussion = ?, updated_at = datetime('now')
   WHERE id = ?`,
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
      input.type,
      input.title,
      input.summary,
      input.evidence_quote,
      JSON.stringify(input.proposed_payload ?? {}),
      input.confidence ?? 0.5,
    );
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },

  setStatus(
    id: number,
    status: NoteProposalStatus,
    discussion?: string | null,
  ): NoteProposal | undefined {
    updateStatusStmt.run(status, discussion ?? null, id);
    return this.get(id);
  },
};
