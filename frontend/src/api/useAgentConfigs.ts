import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { AgentConfig, AgentConfigUpdate } from '../types';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------
export const agentConfigKeys = {
  all: () => ['agent_configs'] as const,
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function useAgentConfigs(): UseQueryResult<AgentConfig[]> {
  return useQuery({
    queryKey: agentConfigKeys.all(),
    queryFn: () => request<AgentConfig[]>('GET', '/api/agents/configs'),
  });
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

export function useUpdateAgentConfig(): UseMutationResult<
  AgentConfig,
  Error,
  { id: number } & AgentConfigUpdate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      request<AgentConfig>('PUT', `/api/agents/configs/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentConfigKeys.all() });
    },
  });
}
