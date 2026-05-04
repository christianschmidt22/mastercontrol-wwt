import { useEffect, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { request } from './http';

export interface MasterNote {
  id: number;
  organization_id: number;
  project_id: number | null;
  content: string;
  content_sha256: string;
  file_path: string | null;
  file_mtime: string | null;
  last_ingested_sha256: string | null;
  last_ingested_at: string | null;
  created_at: string;
  updated_at: string;
}

const keys = {
  org: (orgId: number) => ['master_notes', 'org', orgId] as const,
  project: (orgId: number, projectId: number) =>
    ['master_notes', 'project', orgId, projectId] as const,
};

function endpoint(orgId: number, projectId: number | null): string {
  return projectId === null
    ? `/api/master-notes/orgs/${orgId}`
    : `/api/master-notes/orgs/${orgId}/projects/${projectId}`;
}

/** GET the master note. The server lazy-creates an empty row on first load. */
export function useMasterNote(
  orgId: number,
  projectId: number | null,
): UseQueryResult<MasterNote> {
  const queryKey =
    projectId === null ? keys.org(orgId) : keys.project(orgId, projectId);
  return useQuery({
    queryKey,
    queryFn: () => request<MasterNote>('GET', endpoint(orgId, projectId)),
    enabled: orgId > 0 && (projectId === null || projectId > 0),
    staleTime: 60_000,
  });
}

/** PUT the latest content. Caller is responsible for debouncing. */
export function useSaveMasterNote(): UseMutationResult<
  MasterNote,
  Error,
  { orgId: number; projectId: number | null; content: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, projectId, content }) =>
      request<MasterNote>('PUT', endpoint(orgId, projectId), { content }),
    onSuccess: (saved, vars) => {
      const queryKey =
        vars.projectId === null
          ? keys.org(vars.orgId)
          : keys.project(vars.orgId, vars.projectId);
      qc.setQueryData(queryKey, saved);
    },
  });
}

/** POST .../process — run extraction now against the current master-note text. */
export function useProcessMasterNote(): UseMutationResult<
  { ran: boolean },
  Error,
  { orgId: number; projectId: number | null }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, projectId }) =>
      request<{ ran: boolean }>(
        'POST',
        `${endpoint(orgId, projectId)}/process`,
      ),
    onSuccess: (_, vars) => {
      // Approvals queue may have new items.
      void qc.invalidateQueries({ queryKey: ['note_proposals'] });
      const queryKey =
        vars.projectId === null
          ? keys.org(vars.orgId)
          : keys.project(vars.orgId, vars.projectId);
      void qc.invalidateQueries({ queryKey });
    },
  });
}

/**
 * Hook to drive a debounced autosave from a controlled textarea.
 *
 * Returns `{ value, setValue, status }`:
 *  - `value` mirrors the current draft (initialized from the server fetch).
 *  - `setValue` is the textarea's onChange callback.
 *  - `status` reflects last save state ('idle' | 'saving' | 'saved' | 'error')
 *    so the UI can render an inline indicator.
 *
 * Saves are debounced 600ms; if the user keeps typing the timer resets.
 * On unmount, any pending save is flushed synchronously via fetch with
 * `keepalive: true` so the latest draft isn't lost.
 */
export function useMasterNoteEditor(args: {
  orgId: number;
  projectId: number | null;
}): {
  value: string;
  setValue: (next: string) => void;
  status: 'idle' | 'saving' | 'saved' | 'error';
  loaded: boolean;
  filePath: string | null;
  lastIngestedAt: string | null;
} {
  const { orgId, projectId } = args;
  const note = useMasterNote(orgId, projectId);
  const save = useSaveMasterNote();
  const [value, setValueState] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef('');
  const serverContentRef = useRef<string | null>(null);
  const hydratedScopeRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const scopeKey = `${orgId}:${projectId ?? 'org'}`;

  // Reset the local draft when the tile is reused for a different scope.
  useEffect(() => {
    if (hydratedScopeRef.current === scopeKey) return;
    setValueState('');
    latestRef.current = '';
    serverContentRef.current = null;
    setStatus('idle');
    setLoaded(false);
  }, [scopeKey]);

  // Seed the textarea when the server response for the active scope arrives.
  useEffect(() => {
    if (note.data) {
      serverContentRef.current = note.data.content;
    }

    if (note.data && hydratedScopeRef.current !== scopeKey) {
      setValueState(note.data.content);
      latestRef.current = note.data.content;
      hydratedScopeRef.current = scopeKey;
      setLoaded(true);
    }
  }, [note.data, scopeKey]);

  const setValue = (next: string) => {
    setValueState(next);
    latestRef.current = next;
    setStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save.mutate(
        { orgId, projectId, content: next },
        {
          onSuccess: () => setStatus('saved'),
          onError: () => setStatus('error'),
        },
      );
    }, 600);
  };

  // Flush on unmount so a quick exit doesn't drop the last keystroke.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const pending = latestRef.current;
      const serverContent = serverContentRef.current;
      if (serverContent !== null && pending !== serverContent) {
        const url =
          projectId === null
            ? `/api/master-notes/orgs/${orgId}`
            : `/api/master-notes/orgs/${orgId}/projects/${projectId}`;
        void fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: pending }),
          keepalive: true,
        });
      }
    };
    // We intentionally don't depend on `note.data` — we only flush at unmount.
  }, [orgId, projectId]);

  return {
    value,
    setValue,
    status,
    loaded,
    filePath: note.data?.file_path ?? null,
    lastIngestedAt: note.data?.last_ingested_at ?? null,
  };
}
