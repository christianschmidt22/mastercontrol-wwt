/**
 * useReports.test.ts
 *
 * Happy-path tests for the report TanStack Query hooks. fetch is mocked
 * globally — no network. Mirrors the testing style in
 * `useStreamChat.test.tsx` and `http.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useReports,
  useCreateReport,
  useUpdateReport,
  useRunReportNow,
  reportKeys,
} from './useReports';
import type { Report } from '../types/report';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

const sampleReport: Report = {
  id: 1,
  name: 'Daily Task Review',
  prompt_template: 'You are a CRM assistant. {{date}} {{tasks_due_today}}',
  target: ['all'],
  output_format: 'markdown',
  enabled: true,
  created_at: '2026-04-25T07:00:00.000Z',
  updated_at: '2026-04-25T07:00:00.000Z',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// reportKeys factory
// ---------------------------------------------------------------------------

describe('reportKeys', () => {
  it('list key is `[reports]`', () => {
    expect(reportKeys.list()).toEqual(['reports']);
  });

  it('detail key is `[reports, id]`', () => {
    expect(reportKeys.detail(7)).toEqual(['reports', 7]);
  });

  it('runs key is `[reports, id, runs]`', () => {
    expect(reportKeys.runs(7)).toEqual(['reports', 7, 'runs']);
  });
});

// ---------------------------------------------------------------------------
// useReports — list
// ---------------------------------------------------------------------------

describe('useReports — list', () => {
  it('fetches GET /api/reports and returns the list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([sampleReport]));
    const qc = makeClient();
    const { result } = renderHook(() => useReports(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([sampleReport]);
    expect(fetch).toHaveBeenCalledWith(
      '/api/reports',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

// ---------------------------------------------------------------------------
// useCreateReport
// ---------------------------------------------------------------------------

describe('useCreateReport', () => {
  it('POSTs to /api/reports and invalidates the list cache', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(sampleReport, 201));
    const qc = makeClient();
    // Pre-seed the list so we can confirm invalidation triggers refetch.
    qc.setQueryData(reportKeys.list(), [] as Report[]);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateReport(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        name: sampleReport.name,
        prompt_template: sampleReport.prompt_template,
        target: ['all'],
        cron_expr: '0 7 * * *',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(sampleReport);
    expect(fetch).toHaveBeenCalledWith(
      '/api/reports',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: reportKeys.list() }),
    );
  });
});

// ---------------------------------------------------------------------------
// useUpdateReport
// ---------------------------------------------------------------------------

describe('useUpdateReport', () => {
  it('PUTs to /api/reports/:id and seeds the detail cache', async () => {
    const updated: Report = { ...sampleReport, name: 'Renamed' };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(updated));
    const qc = makeClient();
    const setSpy = vi.spyOn(qc, 'setQueryData');

    const { result } = renderHook(() => useUpdateReport(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ id: 1, name: 'Renamed' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/reports/1',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(setSpy).toHaveBeenCalledWith(reportKeys.detail(1), updated);
  });
});

// ---------------------------------------------------------------------------
// useRunReportNow
// ---------------------------------------------------------------------------

describe('useRunReportNow', () => {
  it('POSTs to /api/reports/:id/run-now and returns run_id + output_path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        run_id: 42,
        output_path: 'C:\\mastercontrol\\reports\\1\\42.md',
      }),
    );
    const qc = makeClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useRunReportNow(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      result.current.mutate(1);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      run_id: 42,
      output_path: 'C:\\mastercontrol\\reports\\1\\42.md',
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/reports/1/run-now',
      expect.objectContaining({ method: 'POST' }),
    );
    // runs cache for this report is invalidated so the History drawer
    // refreshes if it's open.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: reportKeys.runs(1) }),
    );
  });

  it('surfaces server error message via mutation.error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Anthropic API key missing' }), {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const qc = makeClient();
    const { result } = renderHook(() => useRunReportNow(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      result.current.mutate(1);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Anthropic API key missing');
  });
});
