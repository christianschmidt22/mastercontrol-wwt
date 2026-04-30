/**
 * TanStack Query hooks for the Outlook integration endpoints.
 *
 * All server state goes through these hooks — no direct fetch() calls
 * in component files.
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
  OutlookMessage,
  OutlookStatus,
  DeviceCodeResponse,
  AuthPollResponse,
} from '../types/outlook';

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
 * Polled every 30s so the UI reflects auth state without a manual refresh.
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

/**
 * POST /api/outlook/auth-start → DeviceCodeResponse
 * Starts a device-code flow and returns the user-facing code + URI.
 */
export function useOutlookAuthStart(): UseMutationResult<
  DeviceCodeResponse,
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<DeviceCodeResponse>('POST', '/api/outlook/auth-start'),
    onSuccess: () => {
      // Status will update once polling completes; preemptively invalidate.
      void qc.invalidateQueries({ queryKey: outlookKeys.status() });
    },
  });
}

/**
 * Poll GET /api/outlook/auth-poll → AuthPollResponse.
 * This is used manually inside OutlookSetup with a setInterval — not a
 * standard useQuery so we can control when polling starts/stops.
 */
export async function fetchAuthPoll(): Promise<AuthPollResponse> {
  return request<AuthPollResponse>('GET', '/api/outlook/auth-poll');
}
