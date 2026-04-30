/**
 * TanStack Query hooks for the Outlook integration endpoints.
 *
 * All server state goes through these hooks — no direct fetch() calls
 * in component files.
 *
 * Auth hooks removed (useOutlookAuthStart, fetchAuthPoll): the integration
 * now reads from the local Outlook desktop app via COM automation, so no
 * OAuth flow is needed (ADR 0009).
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { OutlookMessage, OutlookStatus } from '../types/outlook';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const outlookKeys = {
  status: () => ['outlook', 'status'] as const,
  messages: (orgId: number, limit?: number) =>
    ['outlook', 'messages', orgId, limit] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * GET /api/outlook/status → { connected, email, last_sync }
 * Polled every 30s so the UI reflects Outlook availability without manual refresh.
 */
export function useOutlookStatus(): UseQueryResult<OutlookStatus> {
  return useQuery({
    queryKey: outlookKeys.status(),
    queryFn: () => request<OutlookStatus>('GET', '/api/outlook/status'),
    refetchInterval: 30_000,
  });
}

/**
 * GET /api/outlook/messages?org_id=N&limit=L → OutlookMessage[]
 */
export function useOutlookMessages(
  orgId: number,
  limit = 20,
): UseQueryResult<OutlookMessage[]> {
  return useQuery({
    queryKey: outlookKeys.messages(orgId, limit),
    queryFn: () =>
      request<OutlookMessage[]>(
        'GET',
        `/api/outlook/messages?org_id=${orgId}&limit=${limit}`,
      ),
    enabled: orgId > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * POST /api/outlook/sync-now → { ok: true }
 * Triggers an immediate sync and refetches messages.
 */
export function useOutlookSyncNow(): UseMutationResult<
  { ok: boolean },
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ ok: boolean }>('POST', '/api/outlook/sync-now'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['outlook'] });
    },
  });
}
