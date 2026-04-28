import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { ProjectResource, ProjectResourceCreate } from '../types';

export const projectResourceKeys = {
  list: (projectId: number) => ['project-resources', projectId] as const,
};

export function useProjectResources(projectId: number): UseQueryResult<ProjectResource[]> {
  return useQuery({
    queryKey: projectResourceKeys.list(projectId),
    queryFn: () => request<ProjectResource[]>('GET', `/api/projects/${projectId}/resources`),
    enabled: projectId > 0,
  });
}

export function useCreateProjectResource(
  projectId: number,
): UseMutationResult<ProjectResource, Error, ProjectResourceCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      request<ProjectResource>('POST', `/api/projects/${projectId}/resources`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectResourceKeys.list(projectId) });
    },
  });
}

export function useDeleteProjectResource(
  projectId: number,
): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      request<void>('DELETE', `/api/projects/${projectId}/resources/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectResourceKeys.list(projectId) });
    },
  });
}
