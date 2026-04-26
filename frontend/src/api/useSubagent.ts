/**
 * useSubagent — TanStack Query hooks for the personal-subscription delegation API.
 *
 * Endpoints (provided by backend agent):
 *   POST /api/subagent/delegate
 *   POST /api/subagent/delegate-agentic   ← agentic run via API key
 *   POST /api/subagent/delegate-sdk       ← agentic run via subscription login
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
} from '../types/subagent';

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
