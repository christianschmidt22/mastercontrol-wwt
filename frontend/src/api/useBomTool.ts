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
  BomToolFileList,
  BomToolMoveRequest,
  BomToolMoveResponse,
  BomToolUploadRequest,
} from '../types/bomTool';

export const bomToolKeys = {
  files: (organizationId: number) => ['tools', 'bom', 'files', organizationId] as const,
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
  return useMutation({
    mutationFn: (body) =>
      request<BomToolAnalyzeResponse>('POST', '/api/tools/bom/analyze', body),
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
