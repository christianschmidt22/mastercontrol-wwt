import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type {
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
  OrgType,
} from '../types';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------
export const orgKeys = {
  list: (type?: OrgType) => ['organizations', { type }] as const,
  detail: (id: number) => ['organizations', id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useOrganizations(
  type?: OrgType,
): UseQueryResult<Organization[]> {
  return useQuery({
    queryKey: orgKeys.list(type),
    queryFn: () => {
      const url = type
        ? `/api/organizations?type=${encodeURIComponent(type)}`
        : '/api/organizations';
      return request<Organization[]>('GET', url);
    },
  });
}

export function useOrganization(id: number): UseQueryResult<Organization> {
  return useQuery({
    queryKey: orgKeys.detail(id),
    queryFn: () => request<Organization>('GET', `/api/organizations/${id}`),
    enabled: id > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateOrganization(): UseMutationResult<
  Organization,
  Error,
  OrganizationCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<Organization>('POST', '/api/organizations', body),
    onSuccess: (org) => {
      // Invalidate both the typed list and the unfiltered list
      void qc.invalidateQueries({ queryKey: orgKeys.list(org.type) });
      void qc.invalidateQueries({ queryKey: orgKeys.list() });
    },
  });
}

export function useUpdateOrganization(): UseMutationResult<
  Organization,
  Error,
  { id: number } & OrganizationUpdate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      request<Organization>('PUT', `/api/organizations/${id}`, body),
    onSuccess: (org) => {
      qc.setQueryData(orgKeys.detail(org.id), org);
      void qc.invalidateQueries({ queryKey: orgKeys.list(org.type) });
      void qc.invalidateQueries({ queryKey: orgKeys.list() });
    },
  });
}

export function useDeleteOrganization(): UseMutationResult<
  void,
  Error,
  number
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      request<void>('DELETE', `/api/organizations/${id}`),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: orgKeys.detail(id) });
      // Invalidate all lists — we don't know which type the deleted org had
      void qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}
