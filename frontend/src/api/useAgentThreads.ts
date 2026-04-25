import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';

// ---------------------------------------------------------------------------
// Local types — not yet in frontend/src/types (no AgentThread file there).
// These mirror the backend contract; kept here until types worker adds them.
// ---------------------------------------------------------------------------

export interface AgentThread {
  id: number;
  organization_id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentThreadCreate {
  organization_id: number;
  title?: string | null;
}

/** Role matches agent_messages table: 'user' | 'assistant' */
export type AgentMessageRole = 'user' | 'assistant';

export interface AgentMessage {
  id: number;
  thread_id: number;
  role: AgentMessageRole;
  content: string;
  created_at: string;
}

export interface AgentAuditEntry {
  id: number;
  thread_id: number | null;
  organization_id: number | null;
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  message: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------
export const threadKeys = {
  list: (orgId: number) => ['agent_threads', { orgId }] as const,
  messages: (threadId: number) =>
    ['agent_messages', { threadId }] as const,
  audit: (threadId?: number) =>
    threadId !== undefined
      ? (['agent_audit', { threadId }] as const)
      : (['agent_audit'] as const),
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useAgentThreads(orgId: number): UseQueryResult<AgentThread[]> {
  return useQuery({
    queryKey: threadKeys.list(orgId),
    queryFn: () =>
      request<AgentThread[]>(
        'GET',
        `/api/agents/threads?org_id=${orgId}`,
      ),
    enabled: orgId > 0,
  });
}

export function useAgentMessages(
  threadId: number,
): UseQueryResult<AgentMessage[]> {
  return useQuery({
    queryKey: threadKeys.messages(threadId),
    queryFn: () =>
      request<AgentMessage[]>(
        'GET',
        `/api/agents/threads/${threadId}/messages`,
      ),
    enabled: threadId > 0,
  });
}

/**
 * Audit log for agent tool calls.
 * GET /api/agents/audit — optionally filtered by threadId query param.
 */
export function useAgentAudit(
  threadId?: number,
): UseQueryResult<AgentAuditEntry[]> {
  return useQuery({
    queryKey: threadKeys.audit(threadId),
    queryFn: () => {
      const url =
        threadId !== undefined
          ? `/api/agents/audit?thread_id=${threadId}`
          : '/api/agents/audit';
      return request<AgentAuditEntry[]>('GET', url);
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

export function useCreateAgentThread(): UseMutationResult<
  AgentThread,
  Error,
  AgentThreadCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      request<AgentThread>('POST', '/api/agents/threads', body),
    onSuccess: (thread) => {
      void qc.invalidateQueries({
        queryKey: threadKeys.list(thread.organization_id),
      });
    },
  });
}
