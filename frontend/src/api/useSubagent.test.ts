/**
 * useSubagent.test.ts
 *
 * Tests for the subagent delegation hooks.
 * - useUsage: verifies cache key and query URL
 * - useDelegateAgentic: verifies mutation fires, invalidates usage on success
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useUsage,
  useDelegateAgentic,
  useDelegateAgenticSdk,
  useAuthStatus,
  subagentKeys,
} from './useSubagent';
import type { AgenticResult, UsageAggregate, AuthStatus } from '../types/subagent';

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
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const MOCK_USAGE: UsageAggregate = {
  period: 'session',
  cost_usd: 0.0042,
  requests: 1,
  input_tokens: 100,
  output_tokens: 50,
  total_tokens: 150,
};

const MOCK_AGENTIC_OK: AgenticResult = {
  ok: true,
  transcript: [
    { kind: 'assistant_text', text: 'Done.', turn: 1 },
  ],
  total_usage: {
    input_tokens: 200,
    output_tokens: 80,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
  total_cost_usd: 0.0015,
  iterations: 2,
  stopped_reason: 'end_turn',
};

const MOCK_AGENTIC_ERR: AgenticResult = {
  ok: false,
  error: 'Model refused task',
  transcript_so_far: [],
  total_usage: {
    input_tokens: 10,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// subagentKeys
// ---------------------------------------------------------------------------

describe('subagentKeys', () => {
  it('generates stable cache key for usage period', () => {
    expect(subagentKeys.usage('session')).toEqual(['subagent', 'usage', 'session']);
    expect(subagentKeys.usage('today')).toEqual(['subagent', 'usage', 'today']);
  });
});

// ---------------------------------------------------------------------------
// useUsage
// ---------------------------------------------------------------------------

describe('useUsage', () => {
  it('fetches usage data and returns it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_USAGE));

    const { result } = renderHook(() => useUsage('session'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(MOCK_USAGE);

    // Check the URL used
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe('/api/subagent/usage?period=session');
  });

  it('passes the period to the URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_USAGE));

    renderHook(() => useUsage('today'), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toContain('period=today');
  });
});

// ---------------------------------------------------------------------------
// useDelegateAgentic
// ---------------------------------------------------------------------------

describe('useDelegateAgentic', () => {
  it('calls POST /api/subagent/delegate-agentic and returns ok result', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_AGENTIC_OK));

    const { result } = renderHook(() => useDelegateAgentic(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.mutate({
        task: 'List the files in the workspace',
        tools: ['read_file', 'list_files'],
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(MOCK_AGENTIC_OK);

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe('/api/subagent/delegate-agentic');
    expect(call?.[1]?.method).toBe('POST');
    const body = JSON.parse(call?.[1]?.body as string) as unknown;
    expect(body).toMatchObject({
      task: 'List the files in the workspace',
      tools: ['read_file', 'list_files'],
    });
  });

  it('invalidates usage queries on success', async () => {
    // First call: the delegate-agentic mutation
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_AGENTIC_OK));
    // Subsequent calls for usage invalidation refetch (may or may not fire)
    vi.mocked(fetch).mockResolvedValue(makeJsonResponse(MOCK_USAGE));

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useDelegateAgentic(), { wrapper });

    act(() => {
      result.current.mutate({
        task: 'A task',
        tools: ['list_files'],
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should have invalidated usage queries (prefix invalidation)
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['subagent', 'usage'] }),
    );
  });

  it('surfaces error result when ok=false', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_AGENTIC_ERR));

    const { result } = renderHook(() => useDelegateAgentic(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.mutate({
        task: 'Failing task',
        tools: ['bash'],
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // ok=false is still a successful HTTP response — data carries the error
    expect(result.current.data?.ok).toBe(false);
    if (result.current.data && !result.current.data.ok) {
      expect(result.current.data.error).toBe('Model refused task');
    }
  });

  it('sets isError when the HTTP request itself fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'));

    const { result } = renderHook(() => useDelegateAgentic(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.mutate({
        task: 'Will fail',
        tools: ['list_files'],
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Network failure');
  });
});

// ---------------------------------------------------------------------------
// useDelegateAgenticSdk
// ---------------------------------------------------------------------------

describe('useDelegateAgenticSdk', () => {
  it('calls POST /api/subagent/delegate-sdk and returns ok result', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_AGENTIC_OK));

    const { result } = renderHook(() => useDelegateAgenticSdk(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.mutate({
        task: 'Subscription task',
        tools: ['read_file'],
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe('/api/subagent/delegate-sdk');
    expect(call?.[1]?.method).toBe('POST');
    expect(result.current.data).toEqual(MOCK_AGENTIC_OK);
  });

  it('invalidates usage queries on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse(MOCK_AGENTIC_OK));
    vi.mocked(fetch).mockResolvedValue(makeJsonResponse(MOCK_USAGE));

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useDelegateAgenticSdk(), { wrapper });

    act(() => {
      result.current.mutate({ task: 'sub task', tools: ['list_files'] });
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['subagent', 'usage'] }),
    );
  });

  it('sets isError on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('SDK network error'));

    const { result } = renderHook(() => useDelegateAgenticSdk(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.mutate({ task: 'Fail', tools: [] });
    });

    await waitFor(() => { expect(result.current.isError).toBe(true); });
    expect(result.current.error?.message).toBe('SDK network error');
  });
});

// ---------------------------------------------------------------------------
// useAuthStatus
// ---------------------------------------------------------------------------

describe('useAuthStatus', () => {
  it('returns auth status when endpoint responds', async () => {
    const mockStatus: AuthStatus = {
      subscription_authenticated: true,
      api_key_configured: false,
    };
    // useAuthStatus uses raw fetch (not request()), so mock ok=true response directly
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockStatus), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAuthStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    expect(result.current.data).toEqual(mockStatus);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe('/api/subagent/auth-status');
  });

  it('returns null (graceful fallback) when endpoint returns 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const { result } = renderHook(() => useAuthStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });

    // Graceful degradation — null means "status unknown"
    expect(result.current.data).toBeNull();
  });

  it('uses stable cache key', () => {
    expect(subagentKeys.authStatus()).toEqual(['subagent', 'auth-status']);
  });
});
