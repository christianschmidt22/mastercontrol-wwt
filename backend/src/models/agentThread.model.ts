import { db } from '../db/database.js';

export interface AgentThread {
  id: number;
  organization_id: number;
  title: string | null;
  started_at: string;
  last_message_at: string;
}

export interface AgentThreadInput {
  organization_id: number;
  title?: string | null;
}

const listStmt = db.prepare<[number], AgentThread>(
  'SELECT * FROM agent_threads WHERE organization_id = ? ORDER BY last_message_at DESC'
);
const getStmt = db.prepare<[number], AgentThread>('SELECT * FROM agent_threads WHERE id = ?');
const insertStmt = db.prepare<[number, string | null]>(
  'INSERT INTO agent_threads (organization_id, title) VALUES (?, ?)'
);
const touchStmt = db.prepare<[number]>(
  "UPDATE agent_threads SET last_message_at = datetime('now') WHERE id = ?"
);
const deleteStmt = db.prepare<[number]>('DELETE FROM agent_threads WHERE id = ?');

export const agentThreadModel = {
  listFor: (orgId: number): AgentThread[] => listStmt.all(orgId),

  get: (id: number): AgentThread | undefined => getStmt.get(id),

  create: (input: AgentThreadInput): AgentThread => {
    const result = insertStmt.run(input.organization_id, input.title ?? null);
    return getStmt.get(Number(result.lastInsertRowid))!;
  },

  /** Stamp last_message_at = now; called after each message is appended. */
  touchLastMessage: (threadId: number): boolean => touchStmt.run(threadId).changes > 0,

  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
