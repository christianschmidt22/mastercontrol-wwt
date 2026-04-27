import type { ChatStreamChunk } from '../types';

export interface StreamChatArgs {
  orgId: number;
  threadId?: number;
  content: string;
  onText: (delta: string) => void;
  onToolUse?: (e: { tool: string; input: unknown }) => void;
  onToolResult?: (e: { tool: string; ok: boolean; message?: string }) => void;
  onThread?: (threadId: number) => void;
  onDone?: () => void;
  signal?: AbortSignal;
}

/**
 * Open a streaming chat session with the per-org Claude agent.
 *
 * The backend emits Server-Sent Events over a POST body (not GET — we need
 * to send a JSON payload). Each frame is:
 *
 *   data: <JSON ChatStreamChunk>\n\n
 *
 * The last frame is:
 *
 *   data: [DONE]\n\n
 *
 * On AbortSignal abort the promise rejects with a DOMException whose
 * `name === 'AbortError'`. The caller inspects `signal.aborted` to
 * distinguish a user-abort (keep partial, no error banner) from a real
 * network error (DESIGN.md § States stream-failure pattern).
 */
export async function streamChat(args: StreamChatArgs): Promise<void> {
  const { orgId, threadId, content, onText, onToolUse, onToolResult, onThread, onDone, signal } = args;

  const body: { content: string; thread_id?: number } = { content };
  if (threadId !== undefined) body.thread_id = threadId;

  // AbortError thrown by fetch propagates as-is; callers inspect signal.aborted
  // to distinguish user-abort from network error.
  const res = await fetch(`/api/agents/${orgId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is null');

  const decoder = new TextDecoder();
  // Buffer across chunk boundaries so we never split a "data: ..." line
  let buf = '';

  const processLine = (line: string): boolean => {
    // Returns true if caller should stop reading
    if (!line.startsWith('data: ')) return false;
    const payload = line.slice(6); // strip "data: "

    if (payload === '[DONE]') {
      onDone?.();
      return true;
    }

    let chunk: ChatStreamChunk;
    try {
      chunk = JSON.parse(payload) as ChatStreamChunk;
    } catch {
      // Malformed frame — skip
      return false;
    }

    switch (chunk.type) {
      case 'text':
        onText(chunk.delta);
        break;
      case 'thread':
        onThread?.(chunk.thread_id);
        break;
      case 'tool_use':
        onToolUse?.({ tool: chunk.tool, input: chunk.input });
        break;
      case 'tool_result':
        onToolResult?.({
          tool: chunk.tool,
          ok: chunk.ok,
          message: chunk.message,
        });
        break;
      case 'done':
        onDone?.();
        return true;
    }
    return false;
  };

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // SSE frames are separated by \n\n; split on that boundary
      const frames = buf.split('\n\n');
      // Keep the last (potentially incomplete) segment in the buffer
      buf = frames.pop() ?? '';

      for (const frame of frames) {
        if (signal?.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        // A frame may contain multiple lines; find the "data:" line
        for (const line of frame.split('\n')) {
          const stop = processLine(line.trim());
          if (stop) return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Flush any remaining buffer content (edge case: stream ended without \n\n)
  if (buf.trim()) {
    for (const line of buf.split('\n')) {
      processLine(line.trim());
    }
  }
}
