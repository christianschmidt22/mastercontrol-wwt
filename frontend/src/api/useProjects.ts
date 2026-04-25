import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { Project, ProjectCreate, ProjectUpdate } from '../types';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------
export const projectKeys = {
  list: (orgId: number) => ['projects', { orgId }] as const,
  detail: (id: number) => ['projects', id] as const,
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function useProjects(orgId: number): UseQueryResult<Project[]> {
  return useQuery({
    queryKey: projectKeys.list(orgId),
    queryFn: () =>
      request<Project[]>('GET', `/api/organizations/${orgId}/projects`),
    enabled: orgId > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutations — writes go to the flat /api/projects route
// ---------------------------------------------------------------------------

export function useCreateProject(): UseMutationResult<
  Project,
  Error,
  ProjectCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<Project>('POST', '/api/projects', body),
    onSuccess: (project) => {
      void qc.invalidateQueries({
        queryKey: projectKeys.list(project.organization_id),
      });
    },
  });
}

export function useUpdateProject(): UseMutationResult<
  Project,
  Error,
  { id: number } & ProjectUpdate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      request<Project>('PUT', `/api/projects/${id}`, body),
    onSuccess: (project) => {
      qc.setQueryData(projectKeys.detail(project.id), project);
      void qc.invalidateQueries({
        queryKey: projectKeys.list(project.organization_id),
      });
    },
  });
}

export function useDeleteProject(): UseMutationResult<
  void,
  Error,
  { id: number; orgId: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => request<void>('DELETE', `/api/projects/${id}`),
    onSuccess: (_data, { id, orgId }) => {
      qc.removeQueries({ queryKey: projectKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: projectKeys.list(orgId) });
    },
  });
}
