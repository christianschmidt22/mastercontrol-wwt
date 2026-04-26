/**
 * useSubagent.test.ts
 *
 * Sanity tests for useSubagent hooks:
 *   - cache key shapes are stable
 *   - useUsage fires the correct URL
 *   - useRecentUsage fires the correct URL
 *   - useDelegate POSTs to the correct URL and invalidates usage queries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { subagentKeys, useUsage, useRecentUsage, useDelegate } from './useSubagent';
import type { UsagePeriod, UsageAggregate, UsageEvent, DelegateResult } from '../types/subagent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Extract the URL string from a fetch mock call. */
function getFetchUrl(callArgs: Parameters<typeof global.fetch>): string {
  const [input] = callArgs;
  if (typeof input === 'string') return input;
  if (input instanceof Request) return input.url;
  // URL object
  return (input).toString();
}

const MOCK_AGGREGATE: UsageAggregate = {
  period: 'session',
  session_start: '2026-04-26T00:00:00Z',
  requests: 5,
  input_tokens: 1000,
  output_tokens: 500,
  total_tokens: 1500,
  cost_usd: 0.0042,
};

const MOCK_EVENTS: UsageEvent[] = [
  {
    id: 1,
    occurred_at: '2026-04-26T10:00:00Z',
    source: 'chat',
    model: 'claude-sonnet-4-6',
    input_tokens: 200,
    output_tokens: 100,
    cost_usd: 0.001,
    task_summary: null,
    error: null,
  },
];

const MOCK_DELEGATE_OK: DelegateResult = {
  ok: true,
  content: 'Done.',
  model: 'claude-sonnet-4-6',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

describe('subagentKeys', () => {
  it('usage key includes period', () => {
    const periods: UsagePeriod[] = ['session', 'today', 'week', 'all'];
    for (const p of periods) {
      const key = subagentKeys.usage(p);
      expect(key).toEqual(['subagent', 'usage', p]);
    }
  });

  it('recent key includes limit', () => {
    expect(subagentKeys.recent(10)).toEqual(['subagent', 'usage', 'recent', 10]);
    expect(subagentKeys.recent(5)).toEqual(['subagent', 'usage', 'recent', 5]);
  });
});

// ---------------------------------------------------------------------------
// useUsage
// ---------------------------------------------------------------------------

describe('useUsage', () => {
  it('fetches /api/subagent/usage?period=session and returns aggregate', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_AGGREGATE));

    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useUsage('session'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(MOCK_AGGREGATE);

    // Verify URL was correct
    const firstCall = vi.mocked(fetch).mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      expect(getFetchUrl(firstCall)).toBe('/api/subagent/usage?period=session');
    }

    qc.clear();
  });

  it('fetches /api/subagent/usage?period=week for week period', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonResponse({ ...MOCK_AGGREGATE, period: 'week' }),
    );

    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useUsage('week'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const firstCall = vi.mocked(fetch).mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      expect(getFetchUrl(firstCall)).toBe('/api/subagent/usage?period=week');
    }

    qc.clear();
  });

  it('exposes isLoading and refetch on hook result', () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_AGGREGATE));

    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useUsage('today'), { wrapper });

    expect(typeof result.current.isLoading).toBe('boolean');
    expect(typeof result.current.refetch).toBe('function');

    qc.clear();
  });
});

// ---------------------------------------------------------------------------
// useRecentUsage
// ---------------------------------------------------------------------------

describe('useRecentUsage', () => {
  it('fetches /api/subagent/usage/recent?limit=10 by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_EVENTS));

    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useRecentUsage(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(MOCK_EVENTS);

    const firstCall = vi.mocked(fetch).mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      expect(getFetchUrl(firstCall)).toBe('/api/subagent/usage/recent?limit=10');
    }

    qc.clear();
  });

  it('uses custom limit in URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse([]));

    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useRecentUsage(5), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const firstCall = vi.mocked(fetch).mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      expect(getFetchUrl(firstCall)).toBe('/api/subagent/usage/recent?limit=5');
    }

    qc.clear();
  });
});

// ---------------------------------------------------------------------------
// useDelegate
// ---------------------------------------------------------------------------

describe('useDelegate', () => {
  it('POSTs to /api/subagent/delegate and returns result', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_DELEGATE_OK));

    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useDelegate(), { wrapper });

    result.current.mutate({ task: 'summarise' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(MOCK_DELEGATE_OK);

    const firstCall = vi.mocked(fetch).mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      const [urlArg, init] = firstCall;
      expect(getFetchUrl([urlArg, init])).toBe('/api/subagent/delegate');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({ task: 'summarise' });
    }

    qc.clear();
  });

  it('invalidates usage queries on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_DELEGATE_OK));

    const { qc, wrapper } = makeWrapper();

    // Pre-seed a usage entry in the cache
    qc.setQueryData(subagentKeys.usage('session'), MOCK_AGGREGATE);
    expect(qc.getQueryData(subagentKeys.usage('session'))).toEqual(MOCK_AGGREGATE);

    const { result } = renderHook(() => useDelegate(), { wrapper });

    result.current.mutate({ task: 'test invalidation' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // After mutation success, the query should be marked stale / invalidated
    const state = qc.getQueryState(subagentKeys.usage('session'));
    // invalidateQueries marks the query as stale (invalidated)
    expect(state?.isInvalidated).toBe(true);

    qc.clear();
  });
});
