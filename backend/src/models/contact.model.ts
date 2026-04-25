import { db } from '../db/database.js';

export interface Contact {
  id: number;
  organization_id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  created_at: string;
}

export interface ContactInput {
  organization_id: number;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
}

const listStmt = db.prepare<[number], Contact>(
  'SELECT * FROM contacts WHERE organization_id = ? ORDER BY name COLLATE NOCASE'
);
const getStmt = db.prepare<[number], Contact>('SELECT * FROM contacts WHERE id = ?');
const insertStmt = db.prepare<[number, string, string | null, string | null, string | null, string | null]>(
  'INSERT INTO contacts (organization_id, name, title, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)'
);
const deleteStmt = db.prepare<[number]>('DELETE FROM contacts WHERE id = ?');
const updateStmt = db.prepare<[string, string | null, string | null, string | null, string | null, number]>(
  'UPDATE contacts SET name = ?, title = ?, email = ?, phone = ?, role = ? WHERE id = ?'
);

export const contactModel = {
  listFor: (orgId: number): Contact[] => listStmt.all(orgId),
  get: (id: number): Contact | undefined => getStmt.get(id),
  create: (input: ContactInput): Contact => {
    const result = insertStmt.run(
      input.organization_id,
      input.name,
      input.title ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.role ?? null
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },
  update: (id: number, patch: Partial<Omit<ContactInput, 'organization_id'>>): Contact | undefined => {
    const current = getStmt.get(id);
    if (!current) return undefined;
    updateStmt.run(
      patch.name ?? current.name,
      patch.title !== undefined ? (patch.title ?? null) : current.title,
      patch.email !== undefined ? (patch.email ?? null) : current.email,
      patch.phone !== undefined ? (patch.phone ?? null) : current.phone,
      patch.role !== undefined ? (patch.role ?? null) : current.role,
      id
    );
    return getStmt.get(id);
  },
  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
