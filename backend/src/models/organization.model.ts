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
  update: (id: number, name: string, metadata: Record<string, unknown>): Organization | undefined => {
    updateStmt.run(name, JSON.stringify(metadata), id);
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },
  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
