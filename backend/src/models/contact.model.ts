import { db } from '../db/database.js';

export interface Contact {
  id: number;
  organization_id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  details: string | null;
  created_at: string;
  assigned_org_ids: number[];
}

export interface ContactInput {
  organization_id: number;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  details?: string | null;
  assigned_org_ids?: number[];
}

export interface ContactFilters {
  org_id?: number;
  query?: string;
}

// Raw row returned by GROUP_CONCAT queries before assignment hydration.
interface ContactRow {
  id: number;
  organization_id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  details: string | null;
  created_at: string;
  _assigned_csv: string | null;
}

function hydrate(row: ContactRow): Contact {
  const { _assigned_csv, ...rest } = row;
  return {
    ...rest,
    assigned_org_ids: _assigned_csv
      ? _assigned_csv.split(',').map(Number)
      : [],
  };
}

const listStmt = db.prepare<[number], ContactRow>(`
  SELECT c.*, GROUP_CONCAT(caa.organization_id) AS _assigned_csv
  FROM contacts c
  LEFT JOIN contact_account_assignments caa ON caa.contact_id = c.id
  WHERE c.organization_id = ?
  GROUP BY c.id
  ORDER BY c.name COLLATE NOCASE
`);

function buildListAllQuery(filters: ContactFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.org_id !== undefined) {
    clauses.push('c.organization_id = ?');
    params.push(filters.org_id);
  }

  const q = filters.query?.trim();
  if (q) {
    clauses.push(`(
      c.name LIKE ?
      OR c.title LIKE ?
      OR c.email LIKE ?
      OR c.phone LIKE ?
      OR c.role LIKE ?
    )`);
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return {
    sql: `
      SELECT c.*, GROUP_CONCAT(caa.organization_id) AS _assigned_csv
      FROM contacts c
      LEFT JOIN contact_account_assignments caa ON caa.contact_id = c.id
      ${where}
      GROUP BY c.id
      ORDER BY c.name COLLATE NOCASE
    `,
    params,
  };
}

const getStmt = db.prepare<[number], ContactRow>(`
  SELECT c.*, GROUP_CONCAT(caa.organization_id) AS _assigned_csv
  FROM contacts c
  LEFT JOIN contact_account_assignments caa ON caa.contact_id = c.id
  WHERE c.id = ?
  GROUP BY c.id
`);

const insertStmt = db.prepare<
  [number, string, string | null, string | null, string | null, string | null, string | null]
>(
  'INSERT INTO contacts (organization_id, name, title, email, phone, role, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
);

const updateStmt = db.prepare<
  [string, string | null, string | null, string | null, string | null, string | null, number]
>(
  'UPDATE contacts SET name = ?, title = ?, email = ?, phone = ?, role = ?, details = ? WHERE id = ?',
);

const deleteStmt = db.prepare<[number]>('DELETE FROM contacts WHERE id = ?');
const unlinkTaskContactsStmt = db.prepare<[number]>(
  'UPDATE tasks SET contact_id = NULL WHERE contact_id = ?',
);

const deleteAssignmentsStmt = db.prepare<[number]>(
  'DELETE FROM contact_account_assignments WHERE contact_id = ?',
);

const insertAssignmentStmt = db.prepare<[number, number]>(
  'INSERT OR IGNORE INTO contact_account_assignments (contact_id, organization_id) VALUES (?, ?)',
);

const replaceAssignments = db.transaction(
  (contactId: number, orgIds: number[]) => {
    deleteAssignmentsStmt.run(contactId);
    for (const orgId of orgIds) {
      insertAssignmentStmt.run(contactId, orgId);
    }
  },
);

export const contactModel = {
  listFor: (orgId: number): Contact[] => listStmt.all(orgId).map(hydrate),

  listAll: (filters: ContactFilters = {}): Contact[] => {
    const { sql, params } = buildListAllQuery(filters);
    return db.prepare<unknown[], ContactRow>(sql).all(...params).map(hydrate);
  },

  get: (id: number): Contact | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  create: (input: ContactInput): Contact => {
    const result = insertStmt.run(
      input.organization_id,
      input.name,
      input.title ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.role ?? null,
      input.details ?? null,
    );
    const id = Number(result.lastInsertRowid);
    if (input.assigned_org_ids?.length) {
      replaceAssignments(id, input.assigned_org_ids);
    }
    return contactModel.get(id)!;
  },

  update: (
    id: number,
    patch: Partial<Omit<ContactInput, 'organization_id'>>,
  ): Contact | undefined => {
    const current = contactModel.get(id);
    if (!current) return undefined;
    updateStmt.run(
      patch.name ?? current.name,
      patch.title !== undefined ? (patch.title ?? null) : current.title,
      patch.email !== undefined ? (patch.email ?? null) : current.email,
      patch.phone !== undefined ? (patch.phone ?? null) : current.phone,
      patch.role !== undefined ? (patch.role ?? null) : current.role,
      patch.details !== undefined ? (patch.details ?? null) : current.details,
      id,
    );
    if (patch.assigned_org_ids !== undefined) {
      replaceAssignments(id, patch.assigned_org_ids);
    }
    return contactModel.get(id);
  },

  remove: db.transaction((id: number): boolean => {
    unlinkTaskContactsStmt.run(id);
    return deleteStmt.run(id).changes > 0;
  }),
};
