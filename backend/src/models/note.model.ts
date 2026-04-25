import { db } from '../db/database.js';

export interface Note {
  id: number;
  organization_id: number;
  content: string;
  ai_response: string | null;
  created_at: string;
}

const listStmt = db.prepare<[number], Note>(
  'SELECT * FROM notes WHERE organization_id = ? ORDER BY created_at DESC'
);
const getStmt = db.prepare<[number], Note>('SELECT * FROM notes WHERE id = ?');
const insertStmt = db.prepare<[number, string, string | null]>(
  'INSERT INTO notes (organization_id, content, ai_response) VALUES (?, ?, ?)'
);
const updateAiStmt = db.prepare<[string, number]>('UPDATE notes SET ai_response = ? WHERE id = ?');
const deleteStmt = db.prepare<[number]>('DELETE FROM notes WHERE id = ?');

export const noteModel = {
  listFor: (orgId: number): Note[] => listStmt.all(orgId),
  get: (id: number): Note | undefined => getStmt.get(id),
  create: (orgId: number, content: string, aiResponse: string | null = null): Note => {
    const result = insertStmt.run(orgId, content, aiResponse);
    return getStmt.get(Number(result.lastInsertRowid))!;
  },
  setAiResponse: (id: number, aiResponse: string): void => {
    updateAiStmt.run(aiResponse, id);
  },
  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
