/**
 * useSubagent — TanStack Query hooks for the personal-subscription delegation API.
 *
 * Endpoints (provided by backend agent):
 *   POST /api/subagent/delegate
 *   POST /api/subagent/delegate-agentic         ← agentic run via API key (JSON)
 *   POST /api/subagent/delegate-sdk             ← agentic run via subscription login (JSON)
 *   POST /api/subagent/delegate-agentic-stream  ← agentic run via API key (SSE)
 *   POST /api/subagent/delegate-sdk-stream      ← agentic run via subscription login (SSE)
 *   GET  /api/subagent/usage?period=session|today|week|all
 *   GET  /api/subagent/usage/recent?limit=N
 *   GET  /api/subagent/auth-status        ← subscription + key status probe
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type {
  DelegateRequest,
  DelegateResult,
  UsagePeriod,
  UsageAggregate,
  UsageEvent,
  AgenticDelegateRequest,
  AgenticResult,
  AuthStatus,
  AgenticTokenUsage,
  TranscriptEntry,
} from '../types/subagent';

// ---------------------------------------------------------------------------
// SSE streaming types
// ---------------------------------------------------------------------------

/** One frame delivered from the SSE streaming endpoints. */
export type AgenticStreamEvent =
  | { type: 'transcript'; entry: TranscriptEntry }
  | {
      type: 'done';
      total_usage: AgenticTokenUsage;
      total_cost_usd: number;
      iterations: number;
      stopped_reason: 'end_turn' | 'max_iterations';
    }
  | { type: 'error'; error: string; transcript_so_far: TranscriptEntry[] };

export interface AgenticStreamCallbacks {
  onEntry: (entry: TranscriptEntry) => void;
  onDone: (event: Extract<AgenticStreamEvent, { type: 'done' }>) => void;
  onError: (event: Extract<AgenticStreamEvent, { type: 'error' }>) => void;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const subagentKeys = {
  usage: (period: UsagePeriod) => ['subagent', 'usage', period] as const,
  recent: (limit: number) => ['subagent', 'usage', 'recent', limit] as const,
  authStatus: () => ['subagent', 'auth-status'] as const,
};

// ---------------------------------------------------------------------------
// useUsage — aggregate stats for one period, refetch every 30s
// ---------------------------------------------------------------------------

export function useUsage(period: UsagePeriod): UseQueryResult<UsageAggregate> {
  return useQuery({
    queryKey: subagentKeys.usage(period),
    queryFn: () =>
      request<UsageAggregate>(
        'GET',
        `/api/subagent/usage?period=${encodeURIComponent(period)}`,
      ),
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------------------
// useRecentUsage — last N usage events
// ---------------------------------------------------------------------------

export function useRecentUsage(limit = 10): UseQueryResult<UsageEvent[]> {
  return useQuery({
    queryKey: subagentKeys.recent(limit),
    queryFn: () =>
      request<UsageEvent[]>(
        'GET',
        `/api/subagent/usage/recent?limit=${encodeURIComponent(limit)}`,
      ),
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------------------
// useDelegate — fire a one-off delegation call
// ---------------------------------------------------------------------------

export function useDelegate(): UseMutationResult<
  DelegateResult,
  Error,
  DelegateRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      request<DelegateResult>('POST', '/api/subagent/delegate', body),
    onSuccess: () => {
      // Invalidate all usage queries so the tile refreshes
      void qc.invalidateQueries({ queryKey: ['subagent', 'usage'] });
    },
  });
}

// ---------------------------------------------------------------------------
// useDelegateAgentic — full agentic run with transcript (API-key mode)
// ---------------------------------------------------------------------------

export function useDelegateAgentic(): UseMutationResult<
  AgenticResult,
  Error,
  AgenticDelegateRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      request<AgenticResult>('POST', '/api/subagent/delegate-agentic', body),
    onSuccess: () => {
      // Refresh usage tile after run completes
      void qc.invalidateQueries({ queryKey: ['subagent', 'usage'] });
    },
  });
}

// ---------------------------------------------------------------------------
// useDelegateAgenticSdk — agentic run via Claude.ai subscription (OAuth)
// ---------------------------------------------------------------------------

export function useDelegateAgenticSdk(): UseMutationResult<
  AgenticResult,
  Error,
  AgenticDelegateRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      request<AgenticResult>('POST', '/api/subagent/delegate-sdk', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['subagent', 'usage'] });
    },
  });
}

// ---------------------------------------------------------------------------
// useAuthStatus — probe subscription + key availability, refetch every 30s
//
// If the endpoint returns 404 (not deployed yet), gracefully falls back:
//   subscription_authenticated: undefined (unknown)
//   api_key_configured: undefined (unknown, caller derives from useSetting)
// ---------------------------------------------------------------------------

export function useAuthStatus(): UseQueryResult<AuthStatus | null> {
  return useQuery({
    queryKey: subagentKeys.authStatus(),
    queryFn: async (): Promise<AuthStatus | null> => {
      const res = await fetch('/api/subagent/auth-status');
      // 404 = endpoint not deployed yet; treat as "status unknown" not an error
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`auth-status probe failed: ${res.statusText}`);
      return (await res.json()) as AuthStatus;
    },
    refetchInterval: 30_000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// streamDelegateAgentic — SSE streaming variant for the API-key path
// ---------------------------------------------------------------------------

/**
 * Open a streaming connection to POST /api/subagent/delegate-agentic-stream.
 *
 * The backend emits Server-Sent Events:
 *   data: {"type":"transcript","entry":{...}}\n\n   — one per transcript entry
 *   data: {"type":"done",...}\n\n                   — run completed
 *   data: {"type":"error","error":"...","transcript_so_far":[...]}\n\n
 *   data: [DONE]\n\n                               — final SSE sentinel
 *
 * Mirrors the pattern of streamChat.ts. POST body is required so we use
 * fetch() + ReadableStream (NOT EventSource which only does GET).
 */
export async function streamDelegateAgentic(
  input: AgenticDelegateRequest,
  callbacks: AgenticStreamCallbacks,
): Promise<void> {
  return _openDelegateStream('/api/subagent/delegate-agentic-stream', input, callbacks);
}

// ---------------------------------------------------------------------------
// streamDelegateAgenticSdk — SSE streaming variant for the SDK/subscription path
// ---------------------------------------------------------------------------

export async function streamDelegateAgenticSdk(
  input: AgenticDelegateRequest,
  callbacks: AgenticStreamCallbacks,
): Promise<void> {
  return _openDelegateStream('/api/subagent/delegate-sdk-stream', input, callbacks);
}

// ---------------------------------------------------------------------------
// Shared SSE reader for both streaming variants
// ---------------------------------------------------------------------------

async function _openDelegateStream(
  url: string,
  input: AgenticDelegateRequest,
  { onEntry, onDone, onError, signal }: AgenticStreamCallbacks,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is null');

  const decoder = new TextDecoder();
  let buf = '';

  const processLine = (line: string): boolean => {
    // Returns true if caller should stop reading.
    if (!line.startsWith('data: ')) return false;
    const payload = line.slice(6);

    if (payload === '[DONE]') return true;

    let event: AgenticStreamEvent;
    try {
      event = JSON.parse(payload) as AgenticStreamEvent;
    } catch {
      return false; // malformed frame — skip
    }

    switch (event.type) {
      case 'transcript':
        onEntry(event.entry);
        break;
      case 'done':
        onDone(event);
        return true;
      case 'error':
        onError(event);
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

      // SSE frames are separated by \n\n.
      const frames = buf.split('\n\n');
      buf = frames.pop() ?? '';

      for (const frame of frames) {
        if (signal?.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        for (const line of frame.split('\n')) {
          const stop = processLine(line.trim());
          if (stop) return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Flush any remaining buffer content.
  if (buf.trim()) {
    for (const line of buf.split('\n')) {
      processLine(line.trim());
    }
  }
}
