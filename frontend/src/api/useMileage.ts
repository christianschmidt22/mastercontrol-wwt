import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { request } from './http';
import type { MileageReport } from '../types';

export const mileageKeys = {
  report: (startDate: string, endDate: string, calculate: boolean) =>
    ['tools', 'mileage', 'report', startDate, endDate, calculate] as const,
};

export function useMileageReport(
  startDate: string,
  endDate: string,
  calculate: boolean,
  enabled: boolean,
): UseQueryResult<MileageReport> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    calculate: calculate ? 'true' : 'false',
  });

  return useQuery({
    queryKey: mileageKeys.report(startDate, endDate, calculate),
    queryFn: () => request<MileageReport>('GET', `/api/tools/mileage/report?${params.toString()}`),
    enabled,
  });
}
