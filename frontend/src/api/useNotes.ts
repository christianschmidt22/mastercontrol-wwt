import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type {
  Note,
  NoteCapture,
  NoteCaptureResponse,
  NoteCreate,
  NoteProposal,
  NoteProposalStatus,
  NoteWithOrg,
} from '../types';

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
  unconfirmedAll: (limit: number) => ['notes_unconfirmed_all', { limit }] as const,
  crossOrgInsights: (orgId: number, limit: number) =>
    ['notes_cross_org', orgId, { limit }] as const,
  proposals: (status: NoteProposalStatus, limit: number) =>
    ['note_proposals', { status, limit }] as const,
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

/**
 * Cross-org insights mentioning a specific org — used by the customer detail
 * page "Mentioned by other orgs" panel.
 *
 * Hits GET /api/notes/cross-org-insights?org_id=X&limit=N.
 * Returns NoteWithOrg[] where org_name/org_type belong to the SOURCE org
 * (the one whose agent thread produced the insight).
 */
export function useCrossOrgInsights(
  orgId: number,
  limit = 20,
): UseQueryResult<NoteWithOrg[]> {
  return useQuery({
    queryKey: noteKeys.crossOrgInsights(orgId, limit),
    queryFn: () =>
      request<NoteWithOrg[]>(
        'GET',
        `/api/notes/cross-org-insights?org_id=${orgId}&limit=${limit}`,
      ),
    enabled: orgId > 0,
  });
}

/**
 * Aggregator: fetch all unconfirmed agent_insight notes across all orgs in
 * one request. Replaces the N-per-org fan-out in InsightsTab (Gap #2).
 */
export function useUnconfirmedInsightsAcrossOrgs(
  limit = 50,
): UseQueryResult<NoteWithOrg[]> {
  return useQuery({
    queryKey: noteKeys.unconfirmedAll(limit),
    queryFn: () =>
      request<NoteWithOrg[]>('GET', `/api/notes/unconfirmed?limit=${limit}`),
  });
}

export function useNoteProposals(
  status: NoteProposalStatus = 'pending',
  limit = 20,
): UseQueryResult<NoteProposal[]> {
  return useQuery({
    queryKey: noteKeys.proposals(status, limit),
    queryFn: () =>
      request<NoteProposal[]>(
        'GET',
        `/api/notes/proposals?status=${status}&limit=${limit}`,
      ),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

type CreateNoteContext = {
  previousIncl: Note[] | undefined;
  previousConf: Note[] | undefined;
};

type CaptureNoteContext = CreateNoteContext;

export function useCreateNote(): UseMutationResult<Note, Error, NoteCreate, CreateNoteContext> {
  const qc = useQueryClient();
  return useMutation<Note, Error, NoteCreate, CreateNoteContext>({
    mutationFn: (body) => request<Note>('POST', '/api/notes', body),
    onMutate: async (newNote) => {
      const { organization_id } = newNote;
      // Cancel in-flight refetches for this org
      await qc.cancelQueries({ queryKey: noteKeys.all(organization_id) });
      const inclKey = noteKeys.list(organization_id, true);
      const confKey = noteKeys.list(organization_id, false);
      const previousIncl = qc.getQueryData<Note[]>(inclKey);
      const previousConf = qc.getQueryData<Note[]>(confKey);
      // Prepend an optimistic placeholder — user notes are always confirmed
      const optimistic: Note = {
        id: -Date.now(),
        organization_id,
        content: newNote.content,
        ai_response: null,
        source_path: null,
        file_mtime: null,
        role: newNote.role ?? 'user',
        thread_id: newNote.thread_id ?? null,
        provenance: newNote.provenance ?? null,
        confirmed: true,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<Note[]>(inclKey, (old) => [optimistic, ...(old ?? [])]);
      qc.setQueryData<Note[]>(confKey, (old) => [optimistic, ...(old ?? [])]);
      return { previousIncl, previousConf };
    },
    onError: (_err, newNote, context) => {
      const { organization_id } = newNote;
      if (context?.previousIncl !== undefined) {
        qc.setQueryData(noteKeys.list(organization_id, true), context.previousIncl);
      }
      if (context?.previousConf !== undefined) {
        qc.setQueryData(noteKeys.list(organization_id, false), context.previousConf);
      }
    },
    onSuccess: (note) => {
      // Invalidate both confirmed-only and include-unconfirmed variants
      void qc.invalidateQueries({ queryKey: noteKeys.all(note.organization_id) });
    },
  });
}

export function useCaptureNote(): UseMutationResult<
  NoteCaptureResponse,
  Error,
  NoteCapture,
  CaptureNoteContext
> {
  const qc = useQueryClient();
  return useMutation<NoteCaptureResponse, Error, NoteCapture, CaptureNoteContext>({
    mutationFn: (body) =>
      request<NoteCaptureResponse>('POST', '/api/notes/capture', body),
    onMutate: async (newNote) => {
      const { organization_id } = newNote;
      await qc.cancelQueries({ queryKey: noteKeys.all(organization_id) });
      const inclKey = noteKeys.list(organization_id, true);
      const confKey = noteKeys.list(organization_id, false);
      const previousIncl = qc.getQueryData<Note[]>(inclKey);
      const previousConf = qc.getQueryData<Note[]>(confKey);
      const optimistic: Note = {
        id: -Date.now(),
        organization_id,
        content: newNote.content,
        ai_response: null,
        source_path: null,
        file_mtime: null,
        project_id: newNote.project_id ?? null,
        capture_source: newNote.capture_source ?? 'mastercontrol',
        role: 'user',
        thread_id: null,
        provenance: null,
        confirmed: true,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<Note[]>(inclKey, (old) => [optimistic, ...(old ?? [])]);
      qc.setQueryData<Note[]>(confKey, (old) => [optimistic, ...(old ?? [])]);
      return { previousIncl, previousConf };
    },
    onError: (_err, newNote, context) => {
      const { organization_id } = newNote;
      if (context?.previousIncl !== undefined) {
        qc.setQueryData(noteKeys.list(organization_id, true), context.previousIncl);
      }
      if (context?.previousConf !== undefined) {
        qc.setQueryData(noteKeys.list(organization_id, false), context.previousConf);
      }
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: noteKeys.all(result.note.organization_id) });
      void qc.invalidateQueries({ queryKey: ['note_proposals'] });
    },
  });
}

export function useUpdateNoteProposalStatus(): UseMutationResult<
  NoteProposal,
  Error,
  { id: number; status: Exclude<NoteProposalStatus, 'pending'>; discussion?: string | null }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, discussion }) =>
      request<NoteProposal>('POST', `/api/notes/proposals/${id}/status`, {
        status,
        discussion,
      }),
    onSuccess: (proposal) => {
      void qc.invalidateQueries({ queryKey: ['note_proposals'] });
      void qc.invalidateQueries({ queryKey: noteKeys.all(proposal.organization_id) });
    },
  });
}

/**
 * Re-run extraction on a single proposal using the user's feedback. The
 * server returns the revised proposal (or null if the model decided no
 * proposal should remain — in which case the row is deleted server-side).
 */
export function useReviseNoteProposal(): UseMutationResult<
  NoteProposal | null,
  Error,
  { id: number; orgId: number; feedback: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, feedback }) => {
      const res = await fetch(`/api/notes/proposals/${id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      if (res.status === 204) return null;
      if (!res.ok) {
        let message = res.statusText;
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      return (await res.json()) as NoteProposal;
    },
    onSuccess: (proposal, vars) => {
      void qc.invalidateQueries({ queryKey: ['note_proposals'] });
      void qc.invalidateQueries({ queryKey: noteKeys.all(vars.orgId) });
      if (proposal) {
        void qc.invalidateQueries({ queryKey: noteKeys.all(proposal.organization_id) });
      }
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
      void qc.invalidateQueries({ queryKey: ['notes_unconfirmed_all'] });
      void qc.invalidateQueries({ queryKey: ['notes_cross_org'] });
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
      void qc.invalidateQueries({ queryKey: ['notes_unconfirmed_all'] });
      void qc.invalidateQueries({ queryKey: ['notes_cross_org'] });
    },
  });
}
