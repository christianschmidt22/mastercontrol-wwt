import { db } from '../db/database.js';

export type NoteRole = 'user' | 'assistant' | 'agent_insight' | 'imported';

export interface NoteProvenance {
  tool: string;
  source_thread_id?: number;
  source_org_id?: number;
  web_citations?: string[];
}

interface NoteRow {
  id: number;
  organization_id: number;
  content: string;
  ai_response: string | null;
  source_path: string | null;
  file_mtime: string | null;
  role: NoteRole;
  thread_id: number | null;
  provenance: string | null;
  confirmed: number;
  created_at: string;
}

export interface Note {
  id: number;
  organization_id: number;
  content: string;
  ai_response: string | null;
  source_path: string | null;
  file_mtime: string | null;
  role: NoteRole;
  thread_id: number | null;
  provenance: NoteProvenance | null;
  confirmed: boolean;
  created_at: string;
}

export interface NoteInput {
  organization_id: number;
  content: string;
  ai_response?: string | null;
  source_path?: string | null;
  file_mtime?: string | null;
  role?: NoteRole;
  thread_id?: number | null;
}

const listStmt = db.prepare<[number], NoteRow>(
  'SELECT * FROM notes WHERE organization_id = ? ORDER BY created_at DESC'
);
const getStmt = db.prepare<[number], NoteRow>('SELECT * FROM notes WHERE id = ?');
const insertStmt = db.prepare<
  [number, string, string | null, string | null, string | null, NoteRole, number | null, string | null, number]
>(
  `INSERT INTO notes
     (organization_id, content, ai_response, source_path, file_mtime, role, thread_id, provenance, confirmed)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const updateAiStmt = db.prepare<[string, number]>('UPDATE notes SET ai_response = ? WHERE id = ?');
const confirmStmt = db.prepare<[number]>('UPDATE notes SET confirmed = 1 WHERE id = ?');
const deleteStmt = db.prepare<[number]>('DELETE FROM notes WHERE id = ?');

function hydrate(row: NoteRow): Note {
  return {
    ...row,
    provenance: row.provenance ? (JSON.parse(row.provenance) as NoteProvenance) : null,
    confirmed: row.confirmed === 1,
  };
}

/**
 * R-016 / Phase 1 chat: claude.service builds the volatile system-prompt
 * block from "recent notes for this org". `confirmedOnly: false` gives the
 * org's own page its unconfirmed insights for the inline review surface;
 * other agents call with `confirmedOnly: true` so they only see accepted
 * insights from this org (per R-002 and Q-4).
 */
export interface NoteListOpts {
  confirmedOnly?: boolean;
}

const listRecentStmt = db.prepare<[number, number], NoteRow>(
  'SELECT * FROM notes WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?'
);
const listRecentConfirmedStmt = db.prepare<[number, number], NoteRow>(
  'SELECT * FROM notes WHERE organization_id = ? AND confirmed = 1 ORDER BY created_at DESC LIMIT ?'
);

// ---------------------------------------------------------------------------
// Cross-org unconfirmed insights (Gap #2 aggregator)
// ---------------------------------------------------------------------------

/**
 * Row shape returned by listUnconfirmedAcrossOrgs — a Note joined with
 * the owning org's name and type so the UI can render in one pass.
 */
export interface NoteWithOrgRow {
  id: number;
  organization_id: number;
  org_name: string;
  org_type: string;
  content: string;
  ai_response: string | null;
  source_path: string | null;
  file_mtime: string | null;
  role: NoteRole;
  thread_id: number | null;
  provenance: string | null;
  confirmed: number;
  created_at: string;
}

export interface NoteWithOrg extends Omit<Note, 'confirmed'> {
  org_name: string;
  org_type: string;
  confirmed: boolean;
}

const listUnconfirmedAcrossOrgsStmt = db.prepare<[number], NoteWithOrgRow>(
  `SELECT
     n.id,
     n.organization_id,
     o.name  AS org_name,
     o.type  AS org_type,
     n.content,
     n.ai_response,
     n.source_path,
     n.file_mtime,
     n.role,
     n.thread_id,
     n.provenance,
     n.confirmed,
     n.created_at
   FROM notes n
   JOIN organizations o ON o.id = n.organization_id
   WHERE n.role = 'agent_insight' AND n.confirmed = 0
   ORDER BY n.created_at DESC
   LIMIT ?`,
);

function hydrateWithOrg(row: NoteWithOrgRow): NoteWithOrg {
  return {
    ...row,
    provenance: row.provenance ? (JSON.parse(row.provenance) as NoteProvenance) : null,
    confirmed: row.confirmed === 1,
  };
}

// ---------------------------------------------------------------------------
// notes_unified VIEW queries (R-005)
// ---------------------------------------------------------------------------

/**
 * R-005: Row shape returned by the notes_unified VIEW.
 * Matches the SELECT columns in schema.sql.
 */
export interface UnifiedNoteRow {
  id: number;
  organization_id: number;
  content: string;
  role: string;
  thread_id: number | null;
  confirmed: number;
  provenance: string | null;
  created_at: string;
  source_table: 'note' | 'agent_message';
}

const listUnifiedAllStmt = db.prepare<[number, number], UnifiedNoteRow>(
  `SELECT * FROM notes_unified
   WHERE organization_id = ?
   ORDER BY created_at DESC
   LIMIT ?`,
);

const listUnifiedConfirmedStmt = db.prepare<[number, number], UnifiedNoteRow>(
  `SELECT * FROM notes_unified
   WHERE organization_id = ? AND confirmed = 1
   ORDER BY created_at DESC
   LIMIT ?`,
);

export const noteModel = {
  listFor: (orgId: number): Note[] => listStmt.all(orgId).map(hydrate),

  /**
   * R-005: Query the notes_unified VIEW for an org's note feed.
   * By default includes unconfirmed rows (agent_insights awaiting review).
   * Pass `includeUnconfirmed: false` to restrict to confirmed=1 rows only.
   */
  listUnified: (
    orgId: number,
    opts: { limit?: number; includeUnconfirmed?: boolean } = {},
  ): UnifiedNoteRow[] => {
    const limit = opts.limit ?? 20;
    const stmt = opts.includeUnconfirmed === false
      ? listUnifiedConfirmedStmt
      : listUnifiedAllStmt;
    return stmt.all(orgId, limit);
  },

  /** R-016: returns the most recent N notes for an org, optionally filtering
   *  to confirmed-only. Used by claude.service to hydrate the volatile
   *  system-prompt block on every chat turn. */
  listRecent: (orgId: number, limit: number, opts: NoteListOpts = {}): Note[] => {
    const stmt = opts.confirmedOnly ? listRecentConfirmedStmt : listRecentStmt;
    return stmt.all(orgId, limit).map(hydrate);
  },

  get: (id: number): Note | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  create: (input: NoteInput): Note => {
    const result = insertStmt.run(
      input.organization_id,
      input.content,
      input.ai_response ?? null,
      input.source_path ?? null,
      input.file_mtime ?? null,
      input.role ?? 'user',
      input.thread_id ?? null,
      null,    // provenance — populated only by createInsight
      1        // confirmed = true for user-authored notes
    );
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },

  /**
   * R-002: Write an agent_insight note on `targetOrgId`.
   * Inserted with confirmed=0 so it enters the user review queue.
   * `provenance` captures the tool call context for auditability.
   */
  createInsight: (
    targetOrgId: number,
    content: string,
    provenance: NoteProvenance
  ): Note => {
    const result = insertStmt.run(
      targetOrgId,
      content,
      null,
      null,
      null,
      'agent_insight' as NoteRole,
      null,
      JSON.stringify(provenance),
      0   // confirmed = false — awaits user accept
    );
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },

  setAiResponse: (id: number, aiResponse: string): void => {
    updateAiStmt.run(aiResponse, id);
  },

  /** R-002: Accept an agent_insight — marks confirmed=1 so it flows into other agents' contexts. */
  confirm: (id: number): boolean => confirmStmt.run(id).changes > 0,

  /**
   * R-002: Reject an agent_insight — hard-deletes the row to keep the org's
   * note feed clean. We treat reject as delete (not a status flip) because
   * rejected insights have no value and the user should not see them again.
   */
  reject: (id: number): boolean => deleteStmt.run(id).changes > 0,

  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,

  /** Aggregator: return all unconfirmed agent_insight notes across all orgs,
   *  joined with the org's name and type. Used by GET /api/notes/unconfirmed. */
  listUnconfirmedAcrossOrgs: (limit: number): NoteWithOrg[] =>
    listUnconfirmedAcrossOrgsStmt.all(limit).map(hydrateWithOrg),
};
