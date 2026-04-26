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
