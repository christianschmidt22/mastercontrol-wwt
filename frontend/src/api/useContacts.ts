import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { Contact, ContactCreate, ContactEnrichmentResponse, ContactUpdate, WwtDirectoryResult } from '../types';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------
export const contactKeys = {
  all: (filters?: ContactFilters) => ['contacts', 'all', filters ?? {}] as const,
  list: (orgId: number) => ['contacts', { orgId }] as const,
  detail: (id: number) => ['contacts', id] as const,
};

export interface ContactFilters {
  orgId?: number;
  query?: string;
}

function upsertContact(list: Contact[] | undefined, contact: Contact): Contact[] {
  const contacts = list ?? [];
  const withoutExisting = contacts.filter((item) => item.id !== contact.id);
  return [...withoutExisting, contact].sort((a, b) => a.name.localeCompare(b.name));
}

function removeContact(list: Contact[] | undefined, id: number): Contact[] {
  return (list ?? []).filter((item) => item.id !== id);
}

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

export function useAllContacts(filters: ContactFilters = {}): UseQueryResult<Contact[]> {
  return useQuery({
    queryKey: contactKeys.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.orgId !== undefined) params.set('org_id', String(filters.orgId));
      if (filters.query?.trim()) params.set('q', filters.query.trim());
      const qs = params.toString();
      return request<Contact[]>('GET', qs ? `/api/contacts?${qs}` : '/api/contacts');
    },
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
      qc.setQueryData<Contact[]>(contactKeys.all(), (current) => upsertContact(current, contact));
      qc.setQueryData<Contact[]>(contactKeys.list(contact.organization_id), (current) => upsertContact(current, contact));
      void qc.invalidateQueries({ queryKey: ['contacts', 'all'] });
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
      qc.setQueryData<Contact[]>(contactKeys.all(), (current) => upsertContact(current, contact));
      qc.setQueryData<Contact[]>(contactKeys.list(contact.organization_id), (current) => upsertContact(current, contact));
      void qc.invalidateQueries({ queryKey: ['contacts', 'all'] });
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
      qc.setQueryData<Contact[]>(contactKeys.all(), (current) => removeContact(current, id));
      qc.setQueryData<Contact[]>(contactKeys.list(orgId), (current) => removeContact(current, id));
      void qc.invalidateQueries({ queryKey: ['contacts', 'all'] });
      void qc.invalidateQueries({ queryKey: contactKeys.list(orgId) });
    },
  });
}

export function useEnrichContact(): UseMutationResult<ContactEnrichmentResponse, Error, number> {
  return useMutation({
    mutationFn: (id) => request<ContactEnrichmentResponse>('POST', `/api/contacts/${id}/enrich`),
  });
}

export function useSearchWwtDirectory(): UseMutationResult<WwtDirectoryResult[], Error, string> {
  return useMutation({
    mutationFn: (query) => request<WwtDirectoryResult[]>('GET', `/api/contacts/directory/search?q=${encodeURIComponent(query)}`),
  });
}

export function useImportWwtDirectoryContact(): UseMutationResult<Contact, Error, WwtDirectoryResult> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<Contact>('POST', '/api/contacts/directory/import', body),
    onSuccess: (contact) => {
      qc.setQueryData<Contact[]>(contactKeys.all(), (current) => upsertContact(current, contact));
      qc.setQueryData<Contact[]>(contactKeys.list(contact.organization_id), (current) => upsertContact(current, contact));
      void qc.invalidateQueries({ queryKey: ['contacts', 'all'] });
      void qc.invalidateQueries({ queryKey: contactKeys.list(contact.organization_id) });
      void qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}
