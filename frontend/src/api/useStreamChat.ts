import { useState, useRef, useCallback, useEffect } from 'react';
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

      // Capture in a local so the .catch closure checks THIS call's signal,
      // not abortControllerRef.current (which may already point to a newer ctrl
      // if send() is called again before this stream finishes — ST-02).
      const myCtrl = ctrl;

      streamChat({
        orgId,
        threadId,
        content,
        onText: (delta: string) => {
          accumulatedRef.current += delta;
          setPartialText((prev) => prev + delta);
        },
        onDone: () => {
          // B-12: append the assembled assistant message to optimisticPending
          // so the UI shows the completed turn immediately (the persisted
          // refetch can take 100–500ms to round-trip the DB). The dedupe
          // useEffect below removes optimistic entries once persisted
          // catches up, preventing duplicates.
          const assembled = accumulatedRef.current;
          setOptimisticPending((prev) => {
            if (!assembled) return prev;
            return [...prev, { role: 'assistant' as const, content: assembled }];
          });
          // Reset stream UI
          setStreaming(false);
          setPartialText('');
          // Invalidate persisted queries so TanStack Query syncs from backend
          if (threadId !== undefined) {
            void qc.invalidateQueries({ queryKey: threadKeys.messages(threadId) });
          }
          void qc.invalidateQueries({ queryKey: noteKeys.all(orgId) });
        },
        signal: myCtrl.signal,
      }).catch((err: unknown) => {
        // ST-02: check myCtrl (this stream's controller), not the ref
        // (which may now point to a newer controller).
        if (myCtrl.signal.aborted) {
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

  // B-12: when persisted catches up, drop optimistic entries that already
  // appear in persisted (matching by role + content). Prevents the
  // "assistant message appears twice" duplicate the audit flagged.
  useEffect(() => {
    if (optimisticPending.length === 0) return;
    const filtered = optimisticPending.filter(
      (opt) =>
        !persistedAsMessages.some(
          (p) => p.role === opt.role && p.content === opt.content,
        ),
    );
    if (filtered.length !== optimisticPending.length) {
      setOptimisticPending(filtered);
    }
    // We intentionally depend on the persisted snapshot length + last id only
    // to avoid the deep-equality cost on every render. Either change indicates
    // a refetch landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedMessages.length, persistedMessages[persistedMessages.length - 1]?.id]);

  const messages: StreamChatMessage[] = [...persistedAsMessages, ...optimisticPending];

  return {
    messages,
    stream: { streaming, partial: partialText, failed },
    send,
    stop,
    retry,
  };
}
