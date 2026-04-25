import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { SettingGetResponse, SettingPut } from '../types';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------
export const settingKeys = {
  one: (key: string) => ['settings', key] as const,
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Fetch a single setting by key.
 * The response value may be masked ("***last4") for secret keys.
 */
export function useSetting(key: string): UseQueryResult<SettingGetResponse> {
  return useQuery({
    queryKey: settingKeys.one(key),
    queryFn: () =>
      request<SettingGetResponse>(
        'GET',
        `/api/settings/${encodeURIComponent(key)}`,
      ),
    enabled: key.length > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

export function useSetSetting(): UseMutationResult<void, Error, SettingPut> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<void>('PUT', '/api/settings', body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: settingKeys.one(vars.key) });
    },
  });
}
