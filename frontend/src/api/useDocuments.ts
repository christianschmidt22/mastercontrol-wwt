import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { Document, DocumentCreate } from '../types';

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------
export const documentKeys = {
  list: (orgId: number) => ['documents', { orgId }] as const,
  detail: (id: number) => ['documents', id] as const,
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function useDocuments(orgId: number): UseQueryResult<Document[]> {
  return useQuery({
    queryKey: documentKeys.list(orgId),
    queryFn: () =>
      request<Document[]>('GET', `/api/organizations/${orgId}/documents`),
    enabled: orgId > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutations — writes go to the flat /api/documents route
// ---------------------------------------------------------------------------

export function useCreateDocument(): UseMutationResult<
  Document,
  Error,
  DocumentCreate
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<Document>('POST', '/api/documents', body),
    onSuccess: (doc) => {
      void qc.invalidateQueries({
        queryKey: documentKeys.list(doc.organization_id),
      });
    },
  });
}

export function useDeleteDocument(): UseMutationResult<
  void,
  Error,
  { id: number; orgId: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => request<void>('DELETE', `/api/documents/${id}`),
    onSuccess: (_data, { id, orgId }) => {
      qc.removeQueries({ queryKey: documentKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: documentKeys.list(orgId) });
    },
  });
}
