/**
 * ReportsPage.test.tsx
 *
 * RTL smoke test: renders the page with mocked hooks, verifies a row,
 * exercises Run Now → mocked mutation called, click History → drawer opens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { ReportsPage, humanizeCron, isCronShapeValid } from './ReportsPage';
import type { Report, ReportRun } from '../types/report';

// ---------------------------------------------------------------------------
// Mocks for the hooks the page consumes
// ---------------------------------------------------------------------------

const runNowMutate = vi.fn();
const createMutate = vi.fn();
const updateMutate = vi.fn();

vi.mock('../api/useReports', () => ({
  reportKeys: {
    all: ['reports'],
    list: () => ['reports'],
    detail: (id: number) => ['reports', id],
    runs: (id: number) => ['reports', id, 'runs'],
  },
  useReports: vi.fn(),
  useCreateReport: vi.fn(() => ({
    mutate: createMutate,
    isPending: false,
  })),
  useUpdateReport: vi.fn(() => ({
    mutate: updateMutate,
    isPending: false,
  })),
  useRunReportNow: vi.fn(() => ({
    mutate: runNowMutate,
    isPending: false,
  })),
}));

vi.mock('../api/useReportRuns', () => ({
  useReportRuns: vi.fn(),
  useReportRunOutput: vi.fn(),
}));

vi.mock('../api/useOrganizations', () => ({
  useOrganizations: vi.fn(() => ({ data: [] })),
}));

import { useReports } from '../api/useReports';
import { useReportRuns, useReportRunOutput } from '../api/useReportRuns';
import type { ReportRunOutput } from '../api/useReportRuns';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface ReportListRow extends Report {
  cron_expr?: string;
  next_run_at?: number | null;
  last_run_at?: number | null;
  last_run_status?: ReportRun['status'] | null;
}

const dailyReview: ReportListRow = {
  id: 1,
  name: 'Daily Task Review',
  prompt_template: 'Generate a brief.',
  target: ['all'],
  output_format: 'markdown',
  enabled: true,
  created_at: '2026-04-25T07:00:00.000Z',
  updated_at: '2026-04-25T07:00:00.000Z',
  cron_expr: '0 7 * * *',
  next_run_at: Math.floor(Date.UTC(2026, 3, 26, 7, 0, 0) / 1000),
  last_run_at: Math.floor(Date.UTC(2026, 3, 25, 7, 0, 0) / 1000),
  last_run_status: 'done',
};

const sampleRun: ReportRun = {
  id: 7,
  schedule_id: 1,
  fire_time: Math.floor(Date.UTC(2026, 3, 25, 7, 0, 0) / 1000),
  status: 'done',
  output_path: 'C:\\mastercontrol\\reports\\1\\7.md',
  output_sha256: 'abc',
  summary: 'Today at a glance: …',
  error: null,
  started_at: '2026-04-25T07:00:00.000Z',
  finished_at: '2026-04-25T07:00:08.000Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

const sampleOutput: ReportRunOutput = {
  content: '# Daily Review\n\nToday at a glance: things are fine.',
  output_path: 'C:\\mastercontrol\\reports\\1\\7.md',
  output_sha256: 'abc',
};

beforeEach(() => {
  runNowMutate.mockReset();
  createMutate.mockReset();
  updateMutate.mockReset();

  vi.mocked(useReports).mockReturnValue({
    data: [dailyReview],
    isLoading: false,
    isError: false,
    isSuccess: true,
  } as unknown as ReturnType<typeof useReports>);

  vi.mocked(useReportRuns).mockReturnValue({
    data: [sampleRun],
    isLoading: false,
    isError: false,
    isSuccess: true,
  } as unknown as ReturnType<typeof useReportRuns>);

  vi.mocked(useReportRunOutput).mockReturnValue({
    data: sampleOutput,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useReportRunOutput>);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// humanizeCron / isCronShapeValid — pure unit tests
// ---------------------------------------------------------------------------

describe('humanizeCron', () => {
  it('formats `0 7 * * *` as "Every day at 7:00 AM"', () => {
    expect(humanizeCron('0 7 * * *')).toBe('Every day at 7:00 AM');
  });

  it('formats `*/15 * * * *` as "Every 15 minutes"', () => {
    expect(humanizeCron('*/15 * * * *')).toBe('Every 15 minutes');
  });

  it('formats `0 7 * * 1-5` as "Weekdays at 7:00 AM"', () => {
    expect(humanizeCron('0 7 * * 1-5')).toBe('Weekdays at 7:00 AM');
  });

  it('falls back to the raw expression on shapes it does not recognize', () => {
    expect(humanizeCron('5 0,12 1 1 *')).toBe('5 0,12 1 1 *');
  });
});

describe('isCronShapeValid', () => {
  it('accepts five-field expressions of digits/*/`,`/`-`/`/`', () => {
    expect(isCronShapeValid('0 7 * * *')).toBe(true);
    expect(isCronShapeValid('*/15 * * * 1-5')).toBe(true);
    expect(isCronShapeValid('0,30 7 * * *')).toBe(true);
    expect(isCronShapeValid('0 8 * * MON')).toBe(true);
  });

  it('rejects fewer or extra fields', () => {
    expect(isCronShapeValid('0 7 * *')).toBe(false);
    expect(isCronShapeValid('0 7 * * * *')).toBe(false);
  });

  it('rejects illegal characters', () => {
    expect(isCronShapeValid('0 7 * * $')).toBe(false);
  });

  it('rejects empty', () => {
    expect(isCronShapeValid('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Page rendering + interactions
// ---------------------------------------------------------------------------

describe('ReportsPage — list rendering', () => {
  it('renders the page chrome and one report row', () => {
    renderWithClient(<ReportsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /reports/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: /daily task review/i }),
    ).toBeInTheDocument();
    // Humanized cron appears.
    expect(screen.getByText(/every day at 7:00 am/i)).toBeInTheDocument();
    // Targets label.
    expect(screen.getByText(/all orgs/i)).toBeInTheDocument();
    // Three actions per row.
    expect(
      screen.getByRole('button', { name: /run daily task review now/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /edit daily task review/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /view run history for daily task review/i }),
    ).toBeInTheDocument();
  });

  it('renders an empty-state when there are no reports', () => {
    vi.mocked(useReports).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useReports>);
    renderWithClient(<ReportsPage />);
    expect(screen.getByText(/no reports yet/i)).toBeInTheDocument();
  });
});

describe('ReportsPage — Run Now', () => {
  it('calls the runNow mutation with the report id', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);

    await user.click(
      screen.getByRole('button', { name: /run daily task review now/i }),
    );

    expect(runNowMutate).toHaveBeenCalledTimes(1);
    expect(runNowMutate).toHaveBeenCalledWith(1, expect.any(Object));
  });
});

describe('ReportsPage — History drawer', () => {
  it('opens the history dialog when History is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);

    // No dialog yet.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: /view run history for daily task review/i,
      }),
    );

    // Drawer (dialog with "Run history" title) appears with the run row.
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { level: 2, name: /run history/i }),
    ).toBeInTheDocument();
    // Output path from sampleRun is rendered in the drawer.
    expect(
      screen.getByText(/C:\\mastercontrol\\reports\\1\\7\.md/i),
    ).toBeInTheDocument();
  });
});

describe('ReportsPage — New Report dialog', () => {
  it('opens the create form when "New Report" is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);

    await user.click(screen.getByRole('button', { name: /new report/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /new report/i }),
      ).toBeInTheDocument();
    });
    // Required fields are labeled.
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/prompt template/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/schedule \(cron\)/i)).toBeInTheDocument();
  });
});

describe('ReportsPage — History drawer preview expansion', () => {
  it('clicking Preview on a done run expands the preview region', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReportsPage />);

    // Open the history drawer.
    await user.click(
      screen.getByRole('button', {
        name: /view run history for daily task review/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // The Preview button should appear for the done run.
    const previewBtn = screen.getByRole('button', { name: /preview report output/i });
    expect(previewBtn).toBeInTheDocument();

    // Click it — the preview region should appear.
    await user.click(previewBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /report output for/i }),
      ).toBeInTheDocument();
    });

    // Content from sampleOutput is rendered.
    expect(
      screen.getByRole('heading', { level: 1, name: /daily review/i }),
    ).toBeInTheDocument();

    // The button label should now say Collapse.
    expect(
      screen.getByRole('button', { name: /collapse report preview/i }),
    ).toBeInTheDocument();
  });
});
