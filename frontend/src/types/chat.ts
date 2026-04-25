export interface ChatRequest {
  thread_id?: number;
  content: string;
}

export type ChatStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_use'; tool: string; input: unknown }
  | { type: 'tool_result'; tool: string; ok: boolean; message?: string }
  | { type: 'done' };
