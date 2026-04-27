import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { AgentConfig, AgentConfigUpdate, AgentSection } from '../types';

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

// ---------------------------------------------------------------------------
// Create override mutation (POST /api/agents/configs)
// ---------------------------------------------------------------------------

export interface AgentConfigCreate {
  section: AgentSection;
  organization_id: number;
  system_prompt_template?: string;
  tools_enabled?: Record<string, unknown>;
  model?: string;
}

export function useCreateAgentConfig(): UseMutationResult<
  AgentConfig,
  Error,
  AgentConfigCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<AgentConfig>('POST', '/api/agents/configs', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentConfigKeys.all() });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete override mutation (DELETE /api/agents/configs/:id)
// ---------------------------------------------------------------------------

export function useDeleteAgentConfig(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => request<void>('DELETE', `/api/agents/configs/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentConfigKeys.all() });
    },
  });
}
