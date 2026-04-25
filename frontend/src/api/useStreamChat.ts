import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { streamChat } from './streamChat';
import { useAgentMessages, threadKeys } from './useAgentThreads';
import { noteKeys } from './useNotes';

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface StreamChatMessage {
  id?: string | number;
  role: 'user' | 'assistant';
  content: string;
}

export interface UseStreamChat {
  /** Persisted thread history from agent_messages plus any in-flight assistant text. */
  messages: StreamChatMessage[];
  /** Live state of the in-flight stream. */
  stream: {
    streaming: boolean;
    /** Tokens accumulated for the current in-flight assistant turn. */
    partial: string;
    /** Error message if the stream failed mid-response; null on success. */
    failed: string | null;
  };
  /** Send a new user message; opens an SSE stream against the backend. */
  send: (content: string) => void;
  /** Abort the in-flight stream. The partial text remains visible per
   *  DESIGN.md § States stream-failure pattern. */
  stop: () => void;
  /** After a failed stream, re-send the last user message. */
  retry: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStreamChat(orgId: number, threadId?: number): UseStreamChat {
  const qc = useQueryClient();

  // Persisted history from the backend
  const { data: persistedMessages = [] } = useAgentMessages(threadId ?? 0);

  // Optimistic messages added locally until the persisted query catches up
  const [optimisticPending, setOptimisticPending] = useState<StreamChatMessage[]>([]);

  // Stream state
  const [streaming, setStreaming] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [failed, setFailed] = useState<string | null>(null);

  // Refs so callbacks always see latest values without stale closures
  const lastUserMessageRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track accumulated partial across the entire stream so onDone can read it
  const accumulatedRef = useRef<string>('');

  const send = useCallback(
    (content: string) => {
      // Abort any existing in-flight stream
      abortControllerRef.current?.abort();

      const ctrl = new AbortController();
      abortControllerRef.current = ctrl;

      // Remember for retry
      lastUserMessageRef.current = content;

      // Reset accumulated text tracker
      accumulatedRef.current = '';

      // Optimistically append user message
      setOptimisticPending((prev) => [
        ...prev,
        { role: 'user' as const, content },
      ]);

      // Reset stream state
      setPartialText('');
      setStreaming(true);
      setFailed(null);

      streamChat({
        orgId,
        threadId,
        content,
        onText: (delta: string) => {
          accumulatedRef.current += delta;
          setPartialText((prev) => prev + delta);
        },
        onDone: () => {
          const assembled = accumulatedRef.current;
          // Append assembled assistant message to optimistic list
          setOptimisticPending((prev) => [
            ...prev,
            { role: 'assistant' as const, content: assembled },
          ]);
          // Reset stream UI
          setStreaming(false);
          setPartialText('');
          // Invalidate persisted queries so TanStack Query syncs from backend
          if (threadId !== undefined) {
            void qc.invalidateQueries({ queryKey: threadKeys.messages(threadId) });
          }
          void qc.invalidateQueries({ queryKey: noteKeys.all(orgId) });
        },
        signal: ctrl.signal,
      }).catch((err: unknown) => {
        if (ctrl.signal.aborted) {
          // User-initiated stop: keep partial visible, no error banner
          setFailed(null);
        } else {
          const message = err instanceof Error ? err.message : 'Stream failed';
          setFailed(message);
        }
        setStreaming(false);
      });
    },
    [orgId, threadId, qc],
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    const last = lastUserMessageRef.current;
    if (last) {
      // Remove the last optimistic user message so it won't be doubled
      setOptimisticPending((prev) => {
        // Walk from end to remove the last user-role entry
        const idx = [...prev].reverse().findIndex((m) => m.role === 'user');
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        return [...prev.slice(0, realIdx), ...prev.slice(realIdx + 1)];
      });
      setFailed(null);
      send(last);
    }
  }, [send]);

  // Merge persisted + optimistic; persistedMessages is AgentMessage[] | []
  const persistedAsMessages: StreamChatMessage[] = persistedMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }));

  const messages: StreamChatMessage[] = [...persistedAsMessages, ...optimisticPending];

  return {
    messages,
    stream: { streaming, partial: partialText, failed },
    send,
    stop,
    retry,
  };
}
