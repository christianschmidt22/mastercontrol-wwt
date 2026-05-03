import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { request } from './http';
import type {
  BomToolAnalyzeRequest,
  BomToolAnalyzeResponse,
  BomAnalysisReportList,
  BomCustomerPreferenceList,
  BomCustomerPreferencesSaveRequest,
  BomToolFileList,
  BomToolMoveRequest,
  BomToolMoveResponse,
  BomToolUploadRequest,
} from '../types/bomTool';

export const bomToolKeys = {
  files: (organizationId: number) => ['tools', 'bom', 'files', organizationId] as const,
  preferences: (organizationId: number) => ['tools', 'bom', 'preferences', organizationId] as const,
  reports: (organizationId: number) => ['tools', 'bom', 'reports', organizationId] as const,
};

export function useBomFiles(organizationId: number): UseQueryResult<BomToolFileList> {
  return useQuery({
    queryKey: bomToolKeys.files(organizationId),
    queryFn: () =>
      request<BomToolFileList>(
        'GET',
        `/api/tools/bom/files?org_id=${encodeURIComponent(String(organizationId))}`,
      ),
    enabled: organizationId > 0,
  });
}

export function useBomCustomerPreferences(
  organizationId: number,
): UseQueryResult<BomCustomerPreferenceList> {
  return useQuery({
    queryKey: bomToolKeys.preferences(organizationId),
    queryFn: () =>
      request<BomCustomerPreferenceList>(
        'GET',
        `/api/tools/bom/preferences?org_id=${encodeURIComponent(String(organizationId))}`,
      ),
    enabled: organizationId > 0,
  });
}

export function useBomAnalysisReports(
  organizationId: number,
): UseQueryResult<BomAnalysisReportList> {
  return useQuery({
    queryKey: bomToolKeys.reports(organizationId),
    queryFn: () =>
      request<BomAnalysisReportList>(
        'GET',
        `/api/tools/bom/reports?org_id=${encodeURIComponent(String(organizationId))}`,
      ),
    enabled: organizationId > 0,
  });
}

export function useSaveBomCustomerPreferences(): UseMutationResult<
  BomCustomerPreferenceList,
  Error,
  BomCustomerPreferencesSaveRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      request<BomCustomerPreferenceList>('PUT', '/api/tools/bom/preferences', body),
    onSuccess: (result) => {
      qc.setQueryData(bomToolKeys.preferences(result.organization_id), result);
    },
  });
}

export function useUploadBomFiles(): UseMutationResult<
  BomToolFileList,
  Error,
  BomToolUploadRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<BomToolFileList>('POST', '/api/tools/bom/upload', body),
    onSuccess: (result) => {
      qc.setQueryData(bomToolKeys.files(result.organization_id), result);
    },
  });
}

export function useAnalyzeBomFiles(): UseMutationResult<
  BomToolAnalyzeResponse,
  Error,
  BomToolAnalyzeRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      request<BomToolAnalyzeResponse>('POST', '/api/tools/bom/analyze', body),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: bomToolKeys.reports(result.report.organization_id) });
    },
  });
}

export function useMoveBomFiles(): UseMutationResult<
  BomToolMoveResponse,
  Error,
  BomToolMoveRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<BomToolMoveResponse>('POST', '/api/tools/bom/move', body),
    onSuccess: (result) => {
      qc.setQueryData(bomToolKeys.files(result.from.organization_id), result.from);
      qc.setQueryData(bomToolKeys.files(result.to.organization_id), result.to);
    },
  });
}
