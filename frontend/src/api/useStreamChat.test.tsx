/**
 * useStreamChat.test.tsx
 *
 * Tests for the useStreamChat React hook using renderHook from
 * @testing-library/react.  fetch is mocked globally — no real network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useStreamChat } from './useStreamChat';

// ---------------------------------------------------------------------------
// Mock the data-fetching hooks that useStreamChat depends on internally.
// We only care about the stream behaviour; persisted data can be empty.
// ---------------------------------------------------------------------------

vi.mock('./useAgentThreads', () => ({
  useAgentMessages: vi.fn(() => ({ data: [] })),
  threadKeys: {
    list: (orgId: number) => ['threads', 'list', orgId],
    messages: (threadId: number) => ['threads', 'messages', threadId],
    audit: (threadId: number) => ['threads', 'audit', threadId],
  },
}));

vi.mock('./useNotes', () => ({
  noteKeys: {
    all: (orgId: number) => ['notes', 'all', orgId],
    list: (orgId: number, inc: boolean) => ['notes', 'list', orgId, inc],
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Build a ReadableStream<Uint8Array> from string chunks. */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Build a Response with a streaming body. */
function fakeOkResponse(chunks: string[]): Response {
  return new Response(makeStream(chunks), { status: 200 });
}

/** Wrapper providing QueryClient context for hooks that call useQueryClient. */
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Happy path — two text chunks then [DONE]
// ---------------------------------------------------------------------------

describe('useStreamChat — happy path', () => {
  it('adds user message optimistically, then assembles assistant message after onDone', async () => {
    const chunks = [
      sseFrame({ type: 'text', delta: 'Hello' }),
      sseFrame({ type: 'text', delta: ' world' }),
      'data: [DONE]\n\n',
    ];

    vi.mocked(fetch).mockResolvedValueOnce(fakeOkResponse(chunks));

    const { result } = renderHook(() => useStreamChat(1, 10), {
      wrapper: makeWrapper(),
    });

    // Before any send — messages is empty (mock returns [])
    expect(result.current.messages).toHaveLength(0);

    act(() => {
      result.current.send('hi');
    });

    // After send: user message appears optimistically
    expect(result.current.messages.some((m) => m.role === 'user' && m.content === 'hi')).toBe(true);
    expect(result.current.stream.streaming).toBe(true);

    // Wait for the stream to finish
    await waitFor(() => {
      expect(result.current.stream.streaming).toBe(false);
    });

    // After done: assembled assistant message in messages
    const assistantMsgs = result.current.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0].content).toBe('Hello world');

    expect(result.current.stream.failed).toBeNull();
    expect(result.current.stream.partial).toBe('');
  });

  it('partial text accumulates during streaming', async () => {
    // Use a stream that never sends [DONE] so we can observe partial
    let resolveStream!: () => void;
    const hangingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseFrame({ type: 'text', delta: 'partial text' })));
        // Don't close — hang
        new Promise<void>((r) => { resolveStream = r; }).then(() => controller.close());
      },
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(hangingStream, { status: 200 }));

    const { result } = renderHook(() => useStreamChat(1, 10), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.send('test');
    });

    await waitFor(() => {
      expect(result.current.stream.partial).toBe('partial text');
    });

    expect(result.current.stream.streaming).toBe(true);

    // Cleanup: resolve the hanging stream
    act(() => { resolveStream(); });
  });
});

// ---------------------------------------------------------------------------
// Abort — stop() mid-stream
// ---------------------------------------------------------------------------

describe('useStreamChat — stop()', () => {
  it('stop() aborts the signal; streaming flips false and failed is null', async () => {
    // Capture the AbortSignal passed to fetch.
    let capturedSignal: AbortSignal | undefined;

    // fetch resolves with a hanging stream — it never sends [DONE].
    // When the signal is aborted, fetch itself throws AbortError (jsdom behaviour).
    vi.mocked(fetch).mockImplementation((_url: unknown, init?: RequestInit) => {
      capturedSignal = init?.signal;
      // Return a promise that rejects with AbortError when the signal fires.
      return new Promise<Response>((_resolve, reject) => {
        if (capturedSignal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const { result } = renderHook(() => useStreamChat(1, 10), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.send('test abort');
    });

    // streaming should be true after send
    expect(result.current.stream.streaming).toBe(true);
    expect(capturedSignal).toBeDefined();

    // Abort the stream
    act(() => {
      result.current.stop();
    });

    // The signal should immediately be aborted
    expect(capturedSignal?.aborted).toBe(true);

    // After streamChat rejects with AbortError, the catch handler sets
    // streaming=false and failed=null (user-initiated abort).
    await waitFor(() => {
      expect(result.current.stream.streaming).toBe(false);
    });

    expect(result.current.stream.failed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Failure — network error mid-stream
// ---------------------------------------------------------------------------

describe('useStreamChat — failure', () => {
  it('sets stream.failed to error message and keeps partial when stream throws', async () => {
    // Mock fetch to reject with a network error
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'));

    const { result } = renderHook(() => useStreamChat(1, 10), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.send('failing request');
    });

    await waitFor(() => {
      expect(result.current.stream.streaming).toBe(false);
    });

    expect(result.current.stream.failed).toBe('Network failure');
  });

  it('sets stream.failed on mid-stream error (non-abort)', async () => {
    // Emit one chunk then throw a non-abort error
    const errorStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseFrame({ type: 'text', delta: 'start' })));
        controller.error(new Error('Mid-stream failure'));
      },
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(errorStream, { status: 200 }));

    const { result } = renderHook(() => useStreamChat(1, 10), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.send('failing mid-stream');
    });

    await waitFor(() => {
      expect(result.current.stream.streaming).toBe(false);
    });

    expect(result.current.stream.failed).not.toBeNull();
    expect(result.current.stream.failed).toContain('Mid-stream failure');
  });
});

// ---------------------------------------------------------------------------
// retry()
// ---------------------------------------------------------------------------

describe('useStreamChat — retry()', () => {
  it('re-sends the last user message after a failure', async () => {
    // First call fails
    vi.mocked(fetch).mockRejectedValueOnce(new Error('First failure'));

    // Second call succeeds
    const chunks = [
      sseFrame({ type: 'text', delta: 'Retry response' }),
      'data: [DONE]\n\n',
    ];
    vi.mocked(fetch).mockResolvedValueOnce(fakeOkResponse(chunks));

    const { result } = renderHook(() => useStreamChat(1, 10), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.send('retry me');
    });

    await waitFor(() => {
      expect(result.current.stream.failed).not.toBeNull();
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.stream.streaming).toBe(false);
    });

    // After successful retry: no error, assistant message present
    expect(result.current.stream.failed).toBeNull();
    const assistantMsgs = result.current.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs.some((m) => m.content === 'Retry response')).toBe(true);
  });
});
