import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMasterNoteEditor, type MasterNote } from './useMasterNotes';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeNote(
  organizationId: number,
  content: string,
  overrides: Partial<MasterNote> = {},
): MasterNote {
  return {
    id: organizationId,
    organization_id: organizationId,
    project_id: null,
    content,
    content_sha256: 'hash',
    file_path: `C:/vault/customers/${organizationId}/master-notes.md`,
    file_mtime: null,
    last_ingested_sha256: null,
    last_ingested_at: null,
    created_at: '2026-05-04T12:00:00.000Z',
    updated_at: '2026-05-04T12:00:00.000Z',
    ...overrides,
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useMasterNoteEditor', () => {
  it('marks an empty fetched note as loaded', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(makeNote(2, '')));

    const qc = makeClient();
    const { result } = renderHook(
      () => useMasterNoteEditor({ orgId: 2, projectId: null }),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.value).toBe('');
    expect(result.current.filePath).toContain('master-notes.md');
  });

  it('reseeds the draft when the org changes', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/orgs/3')) {
        return Promise.resolve(jsonResponse(makeNote(3, 'Beta notes')));
      }
      return Promise.resolve(jsonResponse(makeNote(2, 'Alpha notes')));
    });

    const qc = makeClient();
    const { result, rerender } = renderHook(
      ({ orgId }) => useMasterNoteEditor({ orgId, projectId: null }),
      { initialProps: { orgId: 2 }, wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.value).toBe('Alpha notes'));

    rerender({ orgId: 3 });

    await waitFor(() => expect(result.current.value).toBe('Beta notes'));
    expect(result.current.loaded).toBe(true);
  });

  it('flushes an emptied draft on unmount', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(makeNote(2, 'Existing notes')));

    const qc = makeClient();
    const { result, unmount } = renderHook(
      () => useMasterNoteEditor({ orgId: 2, projectId: null }),
      { wrapper: makeWrapper(qc) },
    );

    await waitFor(() => expect(result.current.value).toBe('Existing notes'));

    act(() => {
      result.current.setValue('');
    });
    unmount();

    expect(fetchMock).toHaveBeenLastCalledWith('/api/master-notes/orgs/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
      keepalive: true,
    });
  });
});
