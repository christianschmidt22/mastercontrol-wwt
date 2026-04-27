import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { request } from './http';
import { reportKeys } from './useReports';
import type { ReportRun } from '../types/report';

/**
 * Run history for a single report. The server resolves the report id to
 * its schedule(s) and returns the most recent runs in fire-time-desc
 * order.
 *
 * Backend contract:  GET /api/reports/:id/runs  →  ReportRun[]
 */
export function useReportRuns(
  reportId: number,
  options: { enabled?: boolean } = {},
): UseQueryResult<ReportRun[]> {
  const { enabled = true } = options;
  return useQuery({
    queryKey: reportKeys.runs(reportId),
    queryFn: () =>
      request<ReportRun[]>('GET', `/api/reports/${reportId}/runs`),
    enabled: enabled && reportId > 0,
  });
}

/** Shape returned by GET /api/reports/:id/runs/:run_id/output */
export interface ReportRunOutput {
  content: string;
  output_path: string;
  output_sha256: string | null;
}

/**
 * Fetches the markdown content of a specific run's output file.
 *
 * Backend contract:
 *   GET /api/reports/:id/runs/:run_id/output  →  ReportRunOutput
 *
 * Only enabled when the run exists, belongs to the given report, and
 * the caller explicitly opts in (e.g. when the user expands the row).
 */
export function useReportRunOutput(
  reportId: number,
  runId: number,
  enabled: boolean,
): UseQueryResult<ReportRunOutput> {
  return useQuery({
    queryKey: [...reportKeys.runs(reportId), runId, 'output'],
    queryFn: () =>
      request<ReportRunOutput>(
        'GET',
        `/api/reports/${reportId}/runs/${runId}/output`,
      ),
    enabled: enabled && reportId > 0 && runId > 0,
    // Output content is stable once a run is done — no need to re-fetch.
    staleTime: Infinity,
  });
}
