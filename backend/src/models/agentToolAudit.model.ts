/**
 * R-022: Append + list helpers for the `agent_tool_audit` table.
 *
 * Every tool call (web_search, record_insight, read_document in Phase 2)
 * writes a row via `agentToolAuditModel.append(...)`. The Agents page
 * surfaces these rows in a per-thread audit tab.
 */

import { db } from '../db/database.js';

export type AuditStatus = 'ok' | 'rejected' | 'error';

export interface AgentToolAuditRow {
  id: number;
  thread_id: number;
  tool_name: string;
  input_json: string | null;
  output_json: string | null;
  status: AuditStatus;
  occurred_at: string;
}

export interface AgentToolAuditInput {
  thread_id: number;
  tool_name: string;
  input: unknown;
  output: unknown;
  status: AuditStatus;
}

const insertStmt = db.prepare<
  [number, string, string | null, string | null, AuditStatus]
>(
  `INSERT INTO agent_tool_audit (thread_id, tool_name, input_json, output_json, status)
   VALUES (?, ?, ?, ?, ?)`,
);

const listByThreadStmt = db.prepare<[number], AgentToolAuditRow>(
  `SELECT * FROM agent_tool_audit
   WHERE thread_id = ?
   ORDER BY occurred_at ASC`,
);

const getStmt = db.prepare<[number], AgentToolAuditRow>(
  'SELECT * FROM agent_tool_audit WHERE id = ?',
);

export const agentToolAuditModel = {
  /**
   * Append an audit row for a tool call. `input` and `output` are any
   * JSON-serialisable value — typically the SDK tool-input block and the
   * tool-result content respectively.
   */
  append(input: AgentToolAuditInput): AgentToolAuditRow {
    const result = insertStmt.run(
      input.thread_id,
      input.tool_name,
      input.input != null ? JSON.stringify(input.input) : null,
      input.output != null ? JSON.stringify(input.output) : null,
      input.status,
    );
    return getStmt.get(Number(result.lastInsertRowid))!;
  },

  /**
   * All audit rows for a thread, ordered oldest-first (useful for displaying
   * a tool-call timeline in the Agents page audit tab).
   */
  listByThread(threadId: number): AgentToolAuditRow[] {
    return listByThreadStmt.all(threadId);
  },
};
