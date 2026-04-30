export interface ChatRequest {
  thread_id?: number;
  content: string;
}

export type ChatStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'thread'; thread_id: number }
  | {
      type: 'activity';
      message: string;
      kind?: 'status' | 'tool' | 'success' | 'error';
    }
  | { type: 'error'; message: string }
  | { type: 'tool_use'; tool: string; input: unknown }
  | {
      type: 'tool_result';
      tool: string;
      ok: boolean;
      message?: string;
      payload?: unknown;
    }
  | { type: 'done' };
