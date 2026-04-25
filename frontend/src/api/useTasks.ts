import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { Task, TaskCreate, TaskUpdate, TaskStatus } from '../types';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------
export interface TaskFilters {
  status?: TaskStatus;
  dueBefore?: string;
  orgId?: number;
}

export const taskKeys = {
  list: (filters?: TaskFilters) => ['tasks', filters ?? {}] as const,
  detail: (id: number) => ['tasks', id] as const,
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function useTasks(filters: TaskFilters = {}): UseQueryResult<Task[]> {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.dueBefore) params.set('due_before', filters.dueBefore);
      if (filters.orgId !== undefined)
        params.set('org_id', String(filters.orgId));
      const qs = params.toString();
      return request<Task[]>('GET', qs ? `/api/tasks?${qs}` : '/api/tasks');
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateTask(): UseMutationResult<Task, Error, TaskCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<Task>('POST', '/api/tasks', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTask(): UseMutationResult<
  Task,
  Error,
  { id: number } & TaskUpdate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      request<Task>('PUT', `/api/tasks/${id}`, body),
    onSuccess: (task) => {
      qc.setQueryData(taskKeys.detail(task.id), task);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/**
 * Mark a task complete. POST /api/tasks/:id/complete
 */
export function useCompleteTask(): UseMutationResult<Task, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => request<Task>('POST', `/api/tasks/${id}/complete`),
    onSuccess: (task) => {
      qc.setQueryData(taskKeys.detail(task.id), task);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => request<void>('DELETE', `/api/tasks/${id}`),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: taskKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
