import * as crypto from 'node:crypto';
import { db } from '../db/database.js';

export interface MasterNote {
  id: number;
  organization_id: number;
  project_id: number | null;
  content: string;
  content_sha256: string;
  file_path: string | null;
  file_mtime: string | null;
  last_ingested_sha256: string | null;
  last_ingested_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MasterNoteRow {
  id: number;
  organization_id: number;
  project_id: number | null;
  content: string;
  content_sha256: string;
  file_path: string | null;
  file_mtime: string | null;
  last_ingested_sha256: string | null;
  last_ingested_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MasterNoteUpsertInput {
  organization_id: number;
  project_id: number | null;
  content: string;
  file_path?: string | null;
  file_mtime?: string | null;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

const getOrgStmt = db.prepare<[number], MasterNoteRow>(
  `SELECT * FROM master_notes WHERE organization_id = ? AND project_id IS NULL`,
);
const getProjectStmt = db.prepare<[number, number], MasterNoteRow>(
  `SELECT * FROM master_notes WHERE organization_id = ? AND project_id = ?`,
);
const getByIdStmt = db.prepare<[number], MasterNoteRow>(
  `SELECT * FROM master_notes WHERE id = ?`,
);

const insertStmt = db.prepare<
  [number, number | null, string, string, string | null, string | null]
>(
  `INSERT INTO master_notes
     (organization_id, project_id, content, content_sha256, file_path, file_mtime)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

const updateStmt = db.prepare<
  [string, string, string | null, string | null, number]
>(
  `UPDATE master_notes
     SET content = ?,
         content_sha256 = ?,
         file_path = COALESCE(?, file_path),
         file_mtime = COALESCE(?, file_mtime),
         updated_at = datetime('now')
   WHERE id = ?`,
);

const updateIngestStmt = db.prepare<[string, number]>(
  `UPDATE master_notes
     SET last_ingested_sha256 = ?, last_ingested_at = datetime('now')
   WHERE id = ?`,
);

const listAllStmt = db.prepare<[], MasterNoteRow>(
  `SELECT * FROM master_notes`,
);

export const masterNoteModel = {
  /** Org-scoped master note (project_id IS NULL). */
  getForOrg: (orgId: number): MasterNote | null => {
    const row = getOrgStmt.get(orgId);
    return row ?? null;
  },

  /** Project-scoped master note. */
  getForProject: (orgId: number, projectId: number): MasterNote | null => {
    const row = getProjectStmt.get(orgId, projectId);
    return row ?? null;
  },

  getById: (id: number): MasterNote | null => {
    const row = getByIdStmt.get(id);
    return row ?? null;
  },

  /** All master notes — used by the periodic ingest scanner. */
  listAll: (): MasterNote[] => listAllStmt.all(),

  /**
   * Insert-or-update one master note. Returns the row after the write.
   * `content_sha256` is recomputed from `content` so callers don't have to.
   */
  upsert: (input: MasterNoteUpsertInput): MasterNote => {
    const existing =
      input.project_id === null
        ? getOrgStmt.get(input.organization_id)
        : getProjectStmt.get(input.organization_id, input.project_id);

    const hash = sha256(input.content);
    if (existing) {
      updateStmt.run(
        input.content,
        hash,
        input.file_path ?? null,
        input.file_mtime ?? null,
        existing.id,
      );
      return getByIdStmt.get(existing.id)!;
    }

    const result = insertStmt.run(
      input.organization_id,
      input.project_id,
      input.content,
      hash,
      input.file_path ?? null,
      input.file_mtime ?? null,
    );
    return getByIdStmt.get(Number(result.lastInsertRowid))!;
  },

  /** Mark a master note as having been ingested at its current sha. */
  markIngested: (id: number, ingestedSha: string): void => {
    updateIngestStmt.run(ingestedSha, id);
  },
};
