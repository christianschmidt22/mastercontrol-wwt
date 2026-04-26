/**
 * useSubagent — TanStack Query hooks for the personal-subscription delegation API.
 *
 * Endpoints (provided by backend agent):
 *   POST /api/subagent/delegate
 *   GET  /api/subagent/usage?period=session|today|week|all
 *   GET  /api/subagent/usage/recent?limit=N
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
} from '../types/subagent';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const subagentKeys = {
  usage: (period: UsagePeriod) => ['subagent', 'usage', period] as const,
  recent: (limit: number) => ['subagent', 'usage', 'recent', limit] as const,
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
