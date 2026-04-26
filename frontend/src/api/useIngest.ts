import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { IngestStatus, IngestScanResult } from '../types/report';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const ingestKeys = {
  status: ['ingest', 'status'] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Read-side: most recent scan timestamp + last 20 errors.
 *
 * NOTE: this endpoint is being implemented in a later Phase 2 batch.
 * Calling it now will surface a 404 in the UI; that's expected. The hook
 * is shipped ahead of the route so that subsequent UI work can wire
 * against a stable signature.
 */
export function useIngestStatus(): UseQueryResult<IngestStatus> {
  return useQuery({
    queryKey: ingestKeys.status,
    queryFn: () => request<IngestStatus>('GET', '/api/ingest/status'),
  });
}

/**
 * Manual trigger. After a successful scan, invalidate ingest status and
 * the global notes/mentions caches — a scan can insert imported notes,
 * tombstone deleted ones, and add `note_mentions` rows.
 */
export function useIngestScan(): UseMutationResult<
  IngestScanResult,
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<IngestScanResult>('POST', '/api/ingest/scan'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ingestKeys.status });
      // A scan can mutate notes + mentions broadly; refresh those views.
      void qc.invalidateQueries({ queryKey: ['notes'] });
      void qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}
