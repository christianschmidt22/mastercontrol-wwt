import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { HeartbeatConfig } from '../types/heartbeat';

export const heartbeatKeys = {
  config: ['heartbeat', 'config'] as const,
};

export function useHeartbeatConfig(): UseQueryResult<HeartbeatConfig> {
  return useQuery({
    queryKey: heartbeatKeys.config,
    queryFn: () => request<HeartbeatConfig>('GET', '/api/heartbeat/config'),
  });
}

export function useUpdateHeartbeatConfig(): UseMutationResult<
  HeartbeatConfig,
  Error,
  HeartbeatConfig
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<HeartbeatConfig>('PUT', '/api/heartbeat/config', body),
    onSuccess: (config) => {
      qc.setQueryData(heartbeatKeys.config, config);
    },
  });
}
