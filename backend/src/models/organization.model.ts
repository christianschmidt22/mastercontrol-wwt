import { db } from '../db/database.js';

export type OrgType = 'customer' | 'oem';

interface OrgRow {
  id: number;
  type: OrgType;
  name: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: number;
  type: OrgType;
  name: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInput {
  type: OrgType;
  name: string;
  metadata?: Record<string, unknown>;
}

export interface OrganizationUpdateInput {
  name?: string;
  metadata?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// GET /api/organizations/recent — orgs with last-touched timestamp
// ---------------------------------------------------------------------------

export interface OrgWithLastTouched {
  id: number;
  name: string;
  type: OrgType;
  last_touched: string;
}

interface OrgWithLastTouchedRow {
  id: number;
  name: string;
  type: OrgType;
  last_touched: string;
}

/**
 * Returns all orgs ordered by the most recent activity (latest note or agent
 * thread message), descending. `last_touched` is an ISO date string; orgs with
 * no activity return '1970-01-01'. Used by GET /api/organizations/recent.
 *
 * The CASE picks the greater of MAX(note timestamp) vs MAX(thread timestamp)
 * per org — safe aggregate SQL that avoids the non-deterministic 2-arg MAX()
 * behaviour in a GROUP BY context.
 */
const listRecentWithLastTouchedStmt = db.prepare<[number], OrgWithLastTouchedRow>(
  `SELECT
     o.id,
     o.name,
     o.type,
     CASE
       WHEN COALESCE(MAX(n.created_at), '1970-01-01') >= COALESCE(MAX(t.last_message_at), '1970-01-01')
       THEN COALESCE(MAX(n.created_at), '1970-01-01')
       ELSE COALESCE(MAX(t.last_message_at), '1970-01-01')
     END AS last_touched
   FROM organizations o
   LEFT JOIN notes n ON n.organization_id = o.id
   LEFT JOIN agent_threads t ON t.organization_id = o.id
   GROUP BY o.id
   ORDER BY last_touched DESC
   LIMIT ?`,
);

// ---------------------------------------------------------------------------
// GET /api/organizations/last-touched?type= — per-org activity map for sidebar
// ---------------------------------------------------------------------------

export interface OrgLastTouchedRow {
  id: number;
  last_touched: string;
}

/**
 * Returns { id, last_touched } for every org of the given type.
 * last_touched is the greater of the org's latest note created_at and its
 * latest agent thread last_message_at, formatted as ISO-8601 UTC.
 * Falls back to '1970-01-01T00:00:00Z' for orgs with no activity.
 *
 * Uses correlated subqueries so each org always produces exactly one row,
 * eliminating the Cartesian-product risk of a raw LEFT JOIN with GROUP BY.
 */
const listLastTouchedByTypeStmt = db.prepare<[OrgType], OrgLastTouchedRow>(
  `SELECT
     o.id,
     strftime('%Y-%m-%dT%H:%M:%SZ',
       CASE
         WHEN COALESCE((SELECT MAX(n.created_at) FROM notes n WHERE n.organization_id = o.id), '1970-01-01')
              >= COALESCE((SELECT MAX(t.last_message_at) FROM agent_threads t WHERE t.organization_id = o.id), '1970-01-01')
         THEN COALESCE((SELECT MAX(n.created_at) FROM notes n WHERE n.organization_id = o.id), '1970-01-01')
         ELSE COALESCE((SELECT MAX(t.last_message_at) FROM agent_threads t WHERE t.organization_id = o.id), '1970-01-01')
       END
     ) AS last_touched
   FROM organizations o
   WHERE o.type = ?`,
);

const listByTypeStmt = db.prepare<[OrgType], OrgRow>(
  'SELECT * FROM organizations WHERE type = ? ORDER BY name COLLATE NOCASE'
);
const getStmt = db.prepare<[number], OrgRow>('SELECT * FROM organizations WHERE id = ?');
const insertStmt = db.prepare<[OrgType, string, string]>(
  'INSERT INTO organizations (type, name, metadata) VALUES (?, ?, ?)'
);
const updateStmt = db.prepare<[string, string, number]>(
  "UPDATE organizations SET name = ?, metadata = ?, updated_at = datetime('now') WHERE id = ?"
);
const deleteStmt = db.prepare<[number]>('DELETE FROM organizations WHERE id = ?');

const hydrate = (row: OrgRow): Organization => ({
  ...row,
  metadata: JSON.parse(row.metadata),
});

export const organizationModel = {
  listByType: (type: OrgType): Organization[] => listByTypeStmt.all(type).map(hydrate),
  get: (id: number): Organization | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },
  create: (input: OrganizationInput): Organization => {
    const result = insertStmt.run(input.type, input.name, JSON.stringify(input.metadata ?? {}));
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },
  update: (
    id: number,
    patchOrName: OrganizationUpdateInput | string,
    legacyMetadata?: Record<string, unknown>,
  ): Organization | undefined => {
    const existing = getStmt.get(id);
    if (!existing) return undefined;

    const existingOrg = hydrate(existing);
    const patch: OrganizationUpdateInput =
      typeof patchOrName === 'string'
        ? { name: patchOrName, metadata: legacyMetadata }
        : patchOrName;

    const nextName = patch.name ?? existingOrg.name;
    const nextMetadata =
      patch.metadata === undefined ? existingOrg.metadata : patch.metadata ?? {};
    updateStmt.run(nextName, JSON.stringify(nextMetadata), id);
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },
  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,

  /**
   * GET /api/organizations/recent — all orgs with last_touched, sorted desc.
   * `last_touched` is the max of the org's latest note or latest agent thread
   * message timestamp, defaulting to '1970-01-01' when neither exists.
   */
  listRecentWithLastTouched: (limit: number): OrgWithLastTouched[] =>
    listRecentWithLastTouchedStmt.all(limit),

  /**
   * GET /api/organizations/last-touched?type=
   * Returns { id, last_touched } for every org of the given type.
   * Used by the sidebar to show per-org recent-activity dots.
   */
  listLastTouched: (type: OrgType): OrgLastTouchedRow[] =>
    listLastTouchedByTypeStmt.all(type),
};
