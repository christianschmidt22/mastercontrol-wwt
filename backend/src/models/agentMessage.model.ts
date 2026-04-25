import { db } from '../db/database.js';

export type MessageRole = 'user' | 'assistant' | 'tool';

interface AgentMessageRow {
  id: number;
  thread_id: number;
  role: MessageRole;
  content: string;
  tool_calls: string | null;
  created_at: string;
}

export interface AgentMessage {
  id: number;
  thread_id: number;
  role: MessageRole;
  content: string;
  /** Parsed JSON; null when the message has no tool calls. */
  tool_calls: unknown[] | null;
  created_at: string;
}

export interface AgentMessageInput {
  threadId: number;
  role: MessageRole;
  content: string;
  /** Will be JSON.stringify'd before storage. */
  toolCalls?: unknown[] | null;
}

const listStmt = db.prepare<[number], AgentMessageRow>(
  'SELECT * FROM agent_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC'
);
const getStmt = db.prepare<[number], AgentMessageRow>('SELECT * FROM agent_messages WHERE id = ?');
const insertStmt = db.prepare<[number, MessageRole, string, string | null]>(
  'INSERT INTO agent_messages (thread_id, role, content, tool_calls) VALUES (?, ?, ?, ?)'
);

function hydrate(row: AgentMessageRow): AgentMessage {
  return {
    ...row,
    tool_calls: row.tool_calls ? (JSON.parse(row.tool_calls) as unknown[]) : null,
  };
}

export const agentMessageModel = {
  listForThread: (threadId: number): AgentMessage[] => listStmt.all(threadId).map(hydrate),

  get: (id: number): AgentMessage | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  /** Append a message to the thread. Returns the persisted row. */
  append: (input: AgentMessageInput): AgentMessage => {
    const toolCallsJson =
      input.toolCalls != null ? JSON.stringify(input.toolCalls) : null;
    const result = insertStmt.run(input.threadId, input.role, input.content, toolCallsJson);
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },
};
