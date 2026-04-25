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
  /** Primary list helper. Both names exist as aliases so callers from
   *  parallel-developed branches don't need to be reconciled. */
  listForThread: (threadId: number): AgentMessage[] => listStmt.all(threadId).map(hydrate),
  listByThread: (threadId: number): AgentMessage[] => listStmt.all(threadId).map(hydrate),

  get: (id: number): AgentMessage | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  /**
   * Append a message to the thread. Accepts both the object form
   * `append({ threadId, role, content, toolCalls? })` and the positional
   * form `append(threadId, role, content, toolCalls?)` for compatibility
   * with `claude.service.ts`'s call sites.
   */
  append: (
    threadIdOrInput: number | AgentMessageInput,
    role?: MessageRole,
    content?: string,
    toolCalls?: unknown[] | null
  ): AgentMessage => {
    let input: AgentMessageInput;
    if (typeof threadIdOrInput === 'object') {
      input = threadIdOrInput;
    } else {
      if (role === undefined || content === undefined) {
        throw new TypeError('agentMessageModel.append: role and content are required');
      }
      input = { threadId: threadIdOrInput, role, content, toolCalls: toolCalls ?? null };
    }
    const toolCallsJson =
      input.toolCalls != null ? JSON.stringify(input.toolCalls) : null;
    const result = insertStmt.run(input.threadId, input.role, input.content, toolCallsJson);
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },
};
