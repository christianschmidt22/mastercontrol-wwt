import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { request } from './http';

export type BacklogStatus = 'open' | 'done' | 'snoozed';

export interface BacklogItem {
  id: number;
  title: string;
  notes: string | null;
  due_date: string | null;
  status: BacklogStatus;
  created_at: string;
  completed_at: string | null;
}

export interface BacklogItemCreate {
  title: string;
  notes?: string | null;
  due_date?: string | null;
  status?: BacklogStatus;
}

export interface BacklogItemUpdate {
  title?: string;
  notes?: string | null;
  due_date?: string | null;
  status?: BacklogStatus;
}

export const backlogKeys = {
  list: (status?: BacklogStatus) => ['backlog_items', status ?? 'all'] as const,
};

export function useBacklogItems(status?: BacklogStatus): UseQueryResult<BacklogItem[]> {
  return useQuery({
    queryKey: backlogKeys.list(status),
    queryFn: () => {
      const qs = status ? `?status=${status}` : '';
      return request<BacklogItem[]>('GET', `/api/backlog-items${qs}`);
    },
  });
}

export function useCreateBacklogItem(): UseMutationResult<
  BacklogItem,
  Error,
  BacklogItemCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<BacklogItem>('POST', '/api/backlog-items', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['backlog_items'] });
    },
  });
}

export function useUpdateBacklogItem(): UseMutationResult<
  BacklogItem,
  Error,
  { id: number } & BacklogItemUpdate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      request<BacklogItem>('PUT', `/api/backlog-items/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['backlog_items'] });
    },
  });
}

export function useCompleteBacklogItem(): UseMutationResult<BacklogItem, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => request<BacklogItem>('POST', `/api/backlog-items/${id}/complete`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['backlog_items'] });
    },
  });
}

export function useDeleteBacklogItem(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => request<void>('DELETE', `/api/backlog-items/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['backlog_items'] });
    },
  });
}
