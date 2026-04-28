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
  project_id: number | null;
  capture_source: string | null;
  role: NoteRole;
  thread_id: number | null;
  provenance: string | null;
  confirmed: number;
  created_at: string;
  // Phase 2 ingest columns (005_ingest.sql)
  file_id: string | null;
  content_sha256: string | null;
  last_seen_at: string | null;
  deleted_at: string | null;
  conflict_of_note_id: number | null;
}

export interface Note {
  id: number;
  organization_id: number;
  content: string;
  ai_response: string | null;
  source_path: string | null;
  file_mtime: string | null;
  project_id: number | null;
  capture_source: string | null;
  role: NoteRole;
  thread_id: number | null;
  provenance: NoteProvenance | null;
  confirmed: boolean;
  created_at: string;
  // Phase 2 ingest columns (005_ingest.sql)
  file_id: string | null;
  content_sha256: string | null;
  last_seen_at: string | null;
  deleted_at: string | null;
  conflict_of_note_id: number | null;
}

export interface NoteInput {
  organization_id: number;
  content: string;
  ai_response?: string | null;
  source_path?: string | null;
  file_mtime?: string | null;
  project_id?: number | null;
  capture_source?: string | null;
  role?: NoteRole;
  thread_id?: number | null;
}

const listStmt = db.prepare<[number], NoteRow>(
  'SELECT * FROM notes WHERE organization_id = ? ORDER BY created_at DESC'
);
const getStmt = db.prepare<[number], NoteRow>('SELECT * FROM notes WHERE id = ?');
const insertStmt = db.prepare<
  [
    number,
    string,
    string | null,
    string | null,
    string | null,
    number | null,
    string | null,
    NoteRole,
    number | null,
    string | null,
    number,
  ]
>(
  `INSERT INTO notes
     (organization_id, content, ai_response, source_path, file_mtime, project_id, capture_source, role, thread_id, provenance, confirmed)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const updateAiStmt = db.prepare<[string, number]>('UPDATE notes SET ai_response = ? WHERE id = ?');
const confirmStmt = db.prepare<[number]>('UPDATE notes SET confirmed = 1 WHERE id = ?');
const deleteStmt = db.prepare<[number]>('DELETE FROM notes WHERE id = ?');

function hydrate(row: NoteRow): Note {
  return {
    ...row,
    provenance: row.provenance ? (JSON.parse(row.provenance) as NoteProvenance) : null,
    confirmed: row.confirmed === 1,
    // Phase 2 ingest columns — pass through (nullable strings + numbers)
    file_id: row.file_id ?? null,
    content_sha256: row.content_sha256 ?? null,
    last_seen_at: row.last_seen_at ?? null,
    deleted_at: row.deleted_at ?? null,
    conflict_of_note_id: row.conflict_of_note_id ?? null,
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
// search (Phase 2 — used by the agent `search_notes` tool)
//
// LIKE-based substring scan over `content`. Optional org filter. Bound to
// 10 rows so the agent gets a reasonable signal without blowing the context.
// A proper FTS5 virtual table is a Phase 3 upgrade (per phase-2 plan § Step 7
// open question 5).
// ---------------------------------------------------------------------------
const searchStmt = db.prepare<[string, number | null, number | null], NoteRow>(
  `SELECT * FROM notes
   WHERE content LIKE '%' || ? || '%'
     AND (? IS NULL OR organization_id = ?)
   ORDER BY created_at DESC
   LIMIT 10`,
);

// ---------------------------------------------------------------------------
// Phase 2 ingest statements
// ---------------------------------------------------------------------------

/** Input for creating an imported note from the WorkVault walker. */
export interface NoteIngestInput {
  organization_id: number;
  content: string;
  source_path: string;
  file_mtime: string;
  file_id: string;
  content_sha256: string;
  project_id?: number | null;
  capture_source?: string | null;
}

const getByFileIdStmt = db.prepare<[string], NoteRow>(
  `SELECT * FROM notes WHERE file_id = ? AND deleted_at IS NULL LIMIT 1`,
);

// Parameters: org_id, content, source_path, file_mtime, file_id, content_sha256, last_seen_at
const insertImportedStmt = db.prepare<
  [number, string, string, string, number | null, string | null, string, string, string]
>(
  `INSERT INTO notes
     (organization_id, content, source_path, file_mtime, project_id, capture_source, role, file_id, content_sha256, last_seen_at, confirmed)
   VALUES (?, ?, ?, ?, ?, ?, 'imported', ?, ?, ?, 1)`,
);

const insertCapturedStmt = db.prepare<
  [number, string, string, string, number | null, string, string, string, string]
>(
  `INSERT INTO notes
     (organization_id, content, source_path, file_mtime, project_id, capture_source, role, file_id, content_sha256, last_seen_at, confirmed)
   VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, 1)`,
);

const updateByIngestStmt = db.prepare<[string, string, string, string, number]>(
  `UPDATE notes
   SET content = ?, content_sha256 = ?, file_mtime = ?, last_seen_at = ?
   WHERE id = ?`,
);

const updateByIngestWithOrgStmt = db.prepare<[number, string, string, string, string, number]>(
  `UPDATE notes
   SET organization_id = ?, content = ?, content_sha256 = ?, file_mtime = ?, last_seen_at = ?
   WHERE id = ?`,
);

const touchLastSeenAtStmt = db.prepare<[string, number]>(
  `UPDATE notes SET last_seen_at = ? WHERE id = ?`,
);

const tombstoneStmt = db.prepare<[string, number]>(
  `UPDATE notes SET deleted_at = ? WHERE id = ?`,
);

/** Tombstone all file-sourced notes not seen since a given ISO timestamp. */
const tombstoneStaleSinceStmt = db.prepare<[string]>(
  `UPDATE notes
   SET deleted_at = datetime('now')
   WHERE file_id IS NOT NULL
     AND deleted_at IS NULL
     AND (last_seen_at IS NULL OR last_seen_at < ?)`,
);

// Parameters: org_id, content, source_path, file_mtime, file_id, content_sha256, conflict_of_note_id
const insertConflictStmt = db.prepare<
  [number, string, string, string, string, string, number]
>(
  `INSERT INTO notes
     (organization_id, content, source_path, file_mtime, role, file_id, content_sha256, last_seen_at, confirmed, conflict_of_note_id)
   VALUES (?, ?, ?, ?, 'imported', ?, ?, datetime('now'), 1, ?)`,
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

/**
 * Public shape returned by the aggregator. Built from the JOIN above; only
 * the fields the InsightsTab actually renders are projected. We intentionally
 * do NOT extend `Note` here to keep the wire shape small and decoupled from
 * the file-ingest fields (file_id / content_sha256 / etc.) which are always
 * null on agent_insight rows anyway.
 */
export interface NoteWithOrg {
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
  provenance: NoteProvenance | null;
  confirmed: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// GET /api/notes/recent — most recent user/assistant notes across all orgs
// ---------------------------------------------------------------------------

const listRecentWithOrgStmt = db.prepare<[number], NoteWithOrgRow>(
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
   WHERE n.role IN ('user', 'assistant')
   ORDER BY n.created_at DESC
   LIMIT ?`,
);

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

/**
 * Cross-org insights mentioning a specific org — used by the customer detail
 * page's "Mentioned by other orgs" panel.
 *
 * Returns agent_insight notes from threads belonging to other orgs (i.e. the
 * note lives on a different org's thread) where:
 *   - notes.organization_id = orgId (the insight was recorded FOR this org), OR
 *   - the note appears in note_mentions for orgId (AI-extracted cross-reference)
 * …AND the note's owning agent thread belongs to a different org (not orgId),
 * so we never surface an org's own self-authored insights here.
 *
 * Joins with the thread's org to surface the source org name for display.
 */
const listInsightsMentioningOrgStmt = db.prepare<[number, number, number], NoteWithOrgRow>(
  `SELECT
     n.id,
     n.organization_id,
     src_org.name  AS org_name,
     src_org.type  AS org_type,
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
   -- Resolve the source org via the thread that produced the insight.
   -- provenance->source_org_id is also an option but thread_id is the
   -- canonical link; fall back to organization_id if thread_id is NULL.
   LEFT JOIN agent_threads at2 ON at2.id = n.thread_id
   JOIN organizations src_org
     ON src_org.id = COALESCE(at2.organization_id, n.organization_id)
   WHERE n.role = 'agent_insight'
     -- The insight targets this org directly, or is mentioned via note_mentions
     AND (
       n.organization_id = ?
       OR EXISTS (
         SELECT 1 FROM note_mentions nm
         WHERE nm.note_id = n.id AND nm.mentioned_org_id = ?
       )
     )
     -- The source org is different from the target org (cross-org only)
     AND src_org.id != ?
   ORDER BY n.created_at DESC
   LIMIT 20`,
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

  /**
   * Phase 2: substring search backing the `search_notes` agent tool. Returns
   * up to 10 matching notes. If `orgId` is provided, results are scoped to
   * that org; otherwise the search runs across all orgs.
   */
  search: (query: string, orgId?: number | null): Note[] => {
    const filterOrg = orgId ?? null;
    return searchStmt.all(query, filterOrg, filterOrg).map(hydrate);
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
      input.project_id ?? null,
      input.capture_source ?? null,
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
      null,
      null,
      'agent_insight',
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

  // ---------------------------------------------------------------------------
  // Phase 2 ingest helpers
  // ---------------------------------------------------------------------------

  /**
   * Look up a note by its stable `file_id` UUID. Returns only non-deleted rows.
   * Used by the reconciliation loop to detect insert vs update vs touch.
   */
  getByFileId(fileId: string): Note | undefined {
    const row = getByFileIdStmt.get(fileId);
    return row ? hydrate(row) : undefined;
  },

  /**
   * Insert a new note row for a WorkVault-sourced file.
   * role='imported', confirmed=1, last_seen_at=now().
   */
  createImported(input: NoteIngestInput): Note {
    const now = new Date().toISOString();
    const result = insertImportedStmt.run(
      input.organization_id,
      input.content,
      input.source_path,
      input.file_mtime,
      input.project_id ?? null,
      input.capture_source ?? null,
      input.file_id,
      input.content_sha256,
      now,
    );
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },

  /**
   * Insert a user-authored note captured through MasterControl and already
   * written to markdown. role='user', confirmed=1, last_seen_at=now().
   */
  createCaptured(input: NoteIngestInput): Note {
    const now = new Date().toISOString();
    const result = insertCapturedStmt.run(
      input.organization_id,
      input.content,
      input.source_path,
      input.file_mtime,
      input.project_id ?? null,
      input.capture_source ?? 'mastercontrol',
      input.file_id,
      input.content_sha256,
      now,
    );
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },

  /**
   * Update an existing imported note's content + metadata after the file
   * changed on disk (mtime advanced or sha256 differs).
   * Bumps last_seen_at to now.
   */
  updateByIngest(
    id: number,
    content: string,
    contentSha256: string,
    fileMtime: string,
    organizationId?: number,
  ): void {
    const now = new Date().toISOString();
    if (organizationId !== undefined) {
      updateByIngestWithOrgStmt.run(organizationId, content, contentSha256, fileMtime, now, id);
      return;
    }
    updateByIngestStmt.run(content, contentSha256, fileMtime, now, id);
  },

  /**
   * Touch-only: advance last_seen_at without changing content (file unchanged).
   */
  touchLastSeenAt(id: number): void {
    touchLastSeenAtStmt.run(new Date().toISOString(), id);
  },

  /**
   * Soft-delete (tombstone) a note whose file has been removed from WorkVault.
   * Sets deleted_at to the provided ISO timestamp.
   */
  tombstone(id: number, deletedAt: string): void {
    tombstoneStmt.run(deletedAt, id);
  },

  /**
   * Tombstone all file-sourced notes whose last_seen_at is strictly older than
   * `scanStartIso`. Called after a full scan to catch any file that disappeared
   * between scans. Skips rows already tombstoned.
   */
  tombstoneStaleSince(scanStartIso: string): number {
    return tombstoneStaleSinceStmt.run(scanStartIso).changes;
  },

  /**
   * Insert a conflict note — a new row pointing back to the original via
   * `conflict_of_note_id`. Created when sha256 differs but mtime hasn't
   * advanced (indicates a file was modified without updating mtime, which is
   * unusual and worth flagging).
   */
  createConflict(
    original: Note,
    content: string,
    contentSha256: string,
    fileMtime: string,
  ): Note {
    const result = insertConflictStmt.run(
      original.organization_id,
      content,
      original.source_path ?? '',
      fileMtime,
      original.file_id ?? '',
      contentSha256,
      original.id,
    );
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },

  /**
   * GET /api/notes/recent — most recent user/assistant notes across all orgs,
   * joined with org name + type for display. Limit capped at 50 by the route.
   */
  listRecentWithOrg: (limit: number): NoteWithOrg[] =>
    listRecentWithOrgStmt.all(limit).map(hydrateWithOrg),

  /** Aggregator: return all unconfirmed agent_insight notes across all orgs,
   *  joined with the org's name and type. Used by GET /api/notes/unconfirmed. */
  listUnconfirmedAcrossOrgs: (limit: number): NoteWithOrg[] =>
    listUnconfirmedAcrossOrgsStmt.all(limit).map(hydrateWithOrg),

  /**
   * Cross-org insights mentioning a given org — used by the customer detail
   * page's "Mentioned by other orgs" panel.
   *
   * Returns agent_insight notes that were authored from a DIFFERENT org's
   * agent thread but target this org (either directly via organization_id,
   * or via a note_mention row). Both confirmed and unconfirmed are included
   * so the user can act on them inline.
   */
  listInsightsMentioningOrg: (orgId: number, limit = 20): NoteWithOrg[] =>
    listInsightsMentioningOrgStmt.all(orgId, orgId, orgId).slice(0, limit).map(hydrateWithOrg),
};
