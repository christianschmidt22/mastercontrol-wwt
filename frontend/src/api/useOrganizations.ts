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
  lastTouched: (type: OrgType) => ['organizations', 'last-touched', type] as const,
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

/**
 * Returns a `{ [orgId]: lastTouchedISO }` map for all orgs of the given type.
 * Refreshes every 60 seconds so sidebar dots stay current without a page reload.
 * Used by the sidebar to show the vermilion activity dot per org.
 */
export function useOrgLastTouched(type: OrgType): UseQueryResult<Record<string, string>> {
  return useQuery({
    queryKey: orgKeys.lastTouched(type),
    queryFn: () =>
      request<Record<string, string>>(
        'GET',
        `/api/organizations/last-touched?type=${encodeURIComponent(type)}`,
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
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
