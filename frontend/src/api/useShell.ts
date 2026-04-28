import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { request } from './http';

export function useOpenPath(): UseMutationResult<{ ok: boolean }, Error, string> {
  return useMutation({
    mutationFn: (path: string) =>
      request<{ ok: boolean }>('POST', '/api/shell/open', { path }),
  });
}

export function useBrowsePath(): UseMutationResult<
  { path: string | null },
  Error,
  { orgId: number; currentPath?: string }
> {
  return useMutation({
    mutationFn: (args) =>
      request<{ path: string | null }>('POST', '/api/shell/browse', args),
  });
}
