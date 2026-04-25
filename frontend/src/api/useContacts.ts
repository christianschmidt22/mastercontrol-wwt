import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { Contact, ContactCreate, ContactUpdate } from '../types';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------
export const contactKeys = {
  list: (orgId: number) => ['contacts', { orgId }] as const,
  detail: (id: number) => ['contacts', id] as const,
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function useContacts(orgId: number): UseQueryResult<Contact[]> {
  return useQuery({
    queryKey: contactKeys.list(orgId),
    queryFn: () =>
      request<Contact[]>('GET', `/api/organizations/${orgId}/contacts`),
    enabled: orgId > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutations — writes go to the flat /api/contacts route
// ---------------------------------------------------------------------------

export function useCreateContact(): UseMutationResult<
  Contact,
  Error,
  ContactCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<Contact>('POST', '/api/contacts', body),
    onSuccess: (contact) => {
      void qc.invalidateQueries({
        queryKey: contactKeys.list(contact.organization_id),
      });
    },
  });
}

export function useUpdateContact(): UseMutationResult<
  Contact,
  Error,
  { id: number } & ContactUpdate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      request<Contact>('PUT', `/api/contacts/${id}`, body),
    onSuccess: (contact) => {
      qc.setQueryData(contactKeys.detail(contact.id), contact);
      void qc.invalidateQueries({
        queryKey: contactKeys.list(contact.organization_id),
      });
    },
  });
}

export function useDeleteContact(): UseMutationResult<
  void,
  Error,
  { id: number; orgId: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => request<void>('DELETE', `/api/contacts/${id}`),
    onSuccess: (_data, { id, orgId }) => {
      qc.removeQueries({ queryKey: contactKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: contactKeys.list(orgId) });
    },
  });
}
