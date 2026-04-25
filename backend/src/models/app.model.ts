import { db } from '../db/database.js';

export interface OrgApp {
  id: number;
  organization_id: number;
  app_name: string;
  vendor: string | null;
  notes: string | null;
}

export interface OrgAppInput {
  organization_id: number;
  app_name: string;
  vendor?: string | null;
  notes?: string | null;
}

const listStmt = db.prepare<[number], OrgApp>(
  'SELECT * FROM org_apps WHERE organization_id = ? ORDER BY app_name COLLATE NOCASE'
);
const getStmt = db.prepare<[number], OrgApp>('SELECT * FROM org_apps WHERE id = ?');
const insertStmt = db.prepare<[number, string, string | null, string | null]>(
  'INSERT INTO org_apps (organization_id, app_name, vendor, notes) VALUES (?, ?, ?, ?)'
);
const deleteStmt = db.prepare<[number]>('DELETE FROM org_apps WHERE id = ?');

export const appModel = {
  listFor: (orgId: number): OrgApp[] => listStmt.all(orgId),
  create: (input: OrgAppInput): OrgApp => {
    const result = insertStmt.run(
      input.organization_id,
      input.app_name,
      input.vendor ?? null,
      input.notes ?? null
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },
  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
