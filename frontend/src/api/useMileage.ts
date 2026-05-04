import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { request } from './http';
import type {
  MileageCalculation,
  MileageCalculateRequest,
  MileageExportPdfRequest,
  MileageExportPdfResponse,
  MileageReport,
} from '../types';

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

export function useCalculateMileage(): UseMutationResult<
  MileageCalculation,
  Error,
  MileageCalculateRequest
> {
  return useMutation({
    mutationFn: (body) => request<MileageCalculation>('POST', '/api/tools/mileage/calculate', body),
  });
}

export function useExportMileagePdf(): UseMutationResult<
  MileageExportPdfResponse,
  Error,
  MileageExportPdfRequest
> {
  return useMutation({
    mutationFn: (body) => request<MileageExportPdfResponse>('POST', '/api/tools/mileage/export-pdf', body),
  });
}
