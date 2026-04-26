import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type {
  Report,
  ReportCreate,
  ReportUpdate,
  RunNowResult,
} from '../types/report';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const reportKeys = {
  all: ['reports'] as const,
  list: () => ['reports'] as const,
  detail: (id: number) => ['reports', id] as const,
  runs: (id: number) => ['reports', id, 'runs'] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useReports(): UseQueryResult<Report[]> {
  return useQuery({
    queryKey: reportKeys.list(),
    queryFn: () => request<Report[]>('GET', '/api/reports'),
  });
}

export function useReport(id: number): UseQueryResult<Report> {
  return useQuery({
    queryKey: reportKeys.detail(id),
    queryFn: () => request<Report>('GET', `/api/reports/${id}`),
    enabled: id > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateReport(): UseMutationResult<
  Report,
  Error,
  ReportCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<Report>('POST', '/api/reports', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reportKeys.list() });
    },
  });
}

export function useUpdateReport(): UseMutationResult<
  Report,
  Error,
  { id: number } & ReportUpdate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      request<Report>('PUT', `/api/reports/${id}`, body),
    onSuccess: (report) => {
      qc.setQueryData(reportKeys.detail(report.id), report);
      void qc.invalidateQueries({ queryKey: reportKeys.list() });
    },
  });
}

export function useRemoveReport(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => request<void>('DELETE', `/api/reports/${id}`),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: reportKeys.detail(id) });
      qc.removeQueries({ queryKey: reportKeys.runs(id) });
      void qc.invalidateQueries({ queryKey: reportKeys.list() });
    },
  });
}

/**
 * Trigger a one-off run. Server returns the new run_id and the eventual
 * output_path. The History query is invalidated so the drawer refreshes
 * if it's currently open for this report.
 */
export function useRunReportNow(): UseMutationResult<
  RunNowResult,
  Error,
  number
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      request<RunNowResult>('POST', `/api/reports/${id}/run-now`),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: reportKeys.runs(id) });
      // Schedule fields (last_run_at, next_run_at) on the report row may
      // have shifted as a side effect — refresh the list and detail too.
      void qc.invalidateQueries({ queryKey: reportKeys.list() });
      void qc.invalidateQueries({ queryKey: reportKeys.detail(id) });
    },
  });
}
