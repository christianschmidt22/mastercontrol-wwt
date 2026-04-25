import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { Note, NoteCreate } from '../types';

// ---------------------------------------------------------------------------
// Cache key factory
//
// Hierarchical scheme: ['notes', orgId] is a valid prefix that TanStack Query
// v5 partial-match invalidation uses, so all variants for an org are swept
// by invalidating ['notes', orgId].
// ---------------------------------------------------------------------------
export const noteKeys = {
  /** Matches ALL note queries for the org (used for invalidation). */
  all: (orgId: number) => ['notes', orgId] as const,
  list: (orgId: number, includeUnconfirmed: boolean) =>
    ['notes', orgId, { includeUnconfirmed }] as const,
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function useNotes(
  orgId: number,
  opts: { includeUnconfirmed?: boolean } = {},
): UseQueryResult<Note[]> {
  const { includeUnconfirmed = false } = opts;
  return useQuery({
    queryKey: noteKeys.list(orgId, includeUnconfirmed),
    queryFn: () => {
      const url = includeUnconfirmed
        ? `/api/organizations/${orgId}/notes?include_unconfirmed=true`
        : `/api/organizations/${orgId}/notes`;
      return request<Note[]>('GET', url);
    },
    enabled: orgId > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateNote(): UseMutationResult<Note, Error, NoteCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<Note>('POST', '/api/notes', body),
    onSuccess: (note) => {
      // Invalidate both confirmed-only and include-unconfirmed variants
      void qc.invalidateQueries({ queryKey: noteKeys.all(note.organization_id) });
    },
  });
}

export function useDeleteNote(): UseMutationResult<
  void,
  Error,
  { id: number; orgId: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => request<void>('DELETE', `/api/notes/${id}`),
    onSuccess: (_data, { orgId }) => {
      void qc.invalidateQueries({ queryKey: noteKeys.all(orgId) });
    },
  });
}

/**
 * Accept an agent_insight note — moves it from unconfirmed to confirmed.
 * R-002: POST /api/notes/:id/confirm
 */
export function useConfirmInsight(): UseMutationResult<
  Note,
  Error,
  { id: number; orgId: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) =>
      request<Note>('POST', `/api/notes/${id}/confirm`),
    onSuccess: (_data, { orgId }) => {
      void qc.invalidateQueries({ queryKey: noteKeys.all(orgId) });
    },
  });
}

/**
 * Reject an agent_insight note — deletes it.
 * DELETE /api/notes/:id serves double-duty as the reject semantic.
 */
export function useRejectInsight(): UseMutationResult<
  void,
  Error,
  { id: number; orgId: number }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => request<void>('DELETE', `/api/notes/${id}`),
    onSuccess: (_data, { orgId }) => {
      void qc.invalidateQueries({ queryKey: noteKeys.all(orgId) });
    },
  });
}
