import { db } from '../db/database.js';

export interface Contact {
  id: number;
  organization_id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface ContactInput {
  organization_id: number;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
}

const listStmt = db.prepare<[number], Contact>(
  'SELECT * FROM contacts WHERE organization_id = ? ORDER BY name COLLATE NOCASE'
);
const getStmt = db.prepare<[number], Contact>('SELECT * FROM contacts WHERE id = ?');
const insertStmt = db.prepare<[number, string, string | null, string | null, string | null]>(
  'INSERT INTO contacts (organization_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)'
);
const deleteStmt = db.prepare<[number]>('DELETE FROM contacts WHERE id = ?');

export const contactModel = {
  listFor: (orgId: number): Contact[] => listStmt.all(orgId),
  create: (input: ContactInput): Contact => {
    const result = insertStmt.run(
      input.organization_id,
      input.name,
      input.title ?? null,
      input.email ?? null,
      input.phone ?? null
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },
  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
