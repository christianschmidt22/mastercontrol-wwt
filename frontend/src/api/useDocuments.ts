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

type CreateDocContext = { previous: Document[] | undefined };

export function useCreateDocument(): UseMutationResult<
  Document,
  Error,
  DocumentCreate,
  CreateDocContext
> {
  const qc = useQueryClient();
  return useMutation<Document, Error, DocumentCreate, CreateDocContext>({
    mutationFn: (body) => request<Document>('POST', '/api/documents', body),
    onMutate: async (newDoc) => {
      // Cancel in-flight refetches so they don't overwrite our optimistic row
      await qc.cancelQueries({ queryKey: documentKeys.list(newDoc.organization_id) });
      const previous = qc.getQueryData<Document[]>(
        documentKeys.list(newDoc.organization_id),
      );
      // Append an optimistic placeholder (negative id so it never collides)
      qc.setQueryData<Document[]>(
        documentKeys.list(newDoc.organization_id),
        (old) => [
          ...(old ?? []),
          {
            id: -Date.now(),
            organization_id: newDoc.organization_id,
            kind: newDoc.kind,
            label: newDoc.label,
            url_or_path: newDoc.url_or_path,
            source: newDoc.source ?? 'manual',
            created_at: new Date().toISOString(),
          },
        ],
      );
      return { previous };
    },
    onError: (_err, newDoc, context) => {
      // Roll back to the snapshot taken before the optimistic update
      if (context?.previous !== undefined) {
        qc.setQueryData(
          documentKeys.list(newDoc.organization_id),
          context.previous,
        );
      }
    },
    onSuccess: (doc) => {
      // Replace the optimistic placeholder with real server data
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
