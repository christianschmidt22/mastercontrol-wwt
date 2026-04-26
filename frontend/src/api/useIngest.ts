import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { IngestStatus, ScanResult, RetryResult } from '../types/ingest';

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
 * Read-side: most recent source + last 20 errors.
 *
 * Returns { source: IngestSource | null, errors: IngestError[] }
 */
export function useIngestStatus(): UseQueryResult<IngestStatus> {
  return useQuery({
    queryKey: ingestKeys.status,
    queryFn: () => request<IngestStatus>('GET', '/api/ingest/status'),
  });
}

/**
 * Trigger a full WorkVault scan. After success, invalidate ingest status and
 * the global notes/organisations caches — a scan can insert/tombstone notes
 * and add note_mentions rows.
 */
export function useIngestScan(): UseMutationResult<ScanResult, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<ScanResult>('POST', '/api/ingest/scan'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ingestKeys.status });
      void qc.invalidateQueries({ queryKey: ['notes'] });
      void qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

/**
 * Retry a single ingest error by id.
 *
 * Optimistically removes the error from the status cache on mutate; reverts
 * on error. Always refetches status on settled so counts stay accurate.
 */
export function useRetryIngestError(): UseMutationResult<RetryResult, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (errorId: number) =>
      request<RetryResult>('POST', `/api/ingest/errors/${errorId}/retry`),
    onMutate: async (errorId: number) => {
      // Cancel any in-flight status refetch so it doesn't overwrite optimistic.
      await qc.cancelQueries({ queryKey: ingestKeys.status });
      const previous = qc.getQueryData<IngestStatus>(ingestKeys.status);

      // Optimistically remove the error row from the list.
      if (previous) {
        qc.setQueryData<IngestStatus>(ingestKeys.status, {
          ...previous,
          errors: previous.errors.filter((e) => e.id !== errorId),
        });
      }

      return { previous };
    },
    onError: (_err, _errorId, context) => {
      // Revert to the snapshot captured before the optimistic update.
      if (context?.previous !== undefined) {
        qc.setQueryData(ingestKeys.status, context.previous);
      }
    },
    onSettled: () => {
      // Always refetch so the server is the source of truth.
      void qc.invalidateQueries({ queryKey: ingestKeys.status });
    },
  });
}
