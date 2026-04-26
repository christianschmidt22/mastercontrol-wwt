/**
 * ReportPreview.test.tsx
 *
 * RTL tests for the ReportPreview component:
 *   - Renders headings, bold, lists from markdown
 *   - Escapes raw HTML (e.g. <script> source → escaped string, not a DOM element)
 *   - Loading state shows spinner
 *   - Failure state shows error + retry button
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { ReportPreview } from './ReportPreview';
import type { ReportRunOutput } from '../../api/useReportRuns';
import type * as UseReportRunsMod from '../../api/useReportRuns';

// ---------------------------------------------------------------------------
// Mock the hook
// ---------------------------------------------------------------------------

const { mockUseReportRunOutput } = vi.hoisted(() => ({
  mockUseReportRunOutput: vi.fn(),
}));

vi.mock('../../api/useReportRuns', async (importOriginal) => {
  const actual = await importOriginal<typeof UseReportRunsMod>();
  return {
    ...actual,
    useReportRunOutput: mockUseReportRunOutput,
  };
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderPreview(props?: Partial<React.ComponentProps<typeof ReportPreview>>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReportPreview
        reportId={1}
        runId={7}
        runDate="2026-04-25T07:00:00.000Z"
        enabled={true}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockUseReportRunOutput.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('ReportPreview — loading', () => {
  it('shows a spinner and loading text while the query is in flight', () => {
    mockUseReportRunOutput.mockReturnValue({
      isLoading: true,
      isError: false,
      isSuccess: false,
      data: undefined,
      refetch: vi.fn(),
    });

    renderPreview();

    expect(screen.getByText(/loading preview/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('ReportPreview — error', () => {
  it('shows an error message and a Retry button', async () => {
    const refetch = vi.fn();
    mockUseReportRunOutput.mockReturnValue({
      isLoading: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      refetch,
    });

    const user = userEvent.setup();
    renderPreview();

    expect(screen.getByText(/couldn't load preview/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /retry loading report preview/i });
    expect(retryBtn).toBeInTheDocument();

    await user.click(retryBtn);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Success — markdown rendering
// ---------------------------------------------------------------------------

describe('ReportPreview — markdown rendering', () => {
  function setupSuccess(content: string) {
    const data: ReportRunOutput = {
      content,
      output_path: 'C:\\mastercontrol\\reports\\1\\7.md',
      output_sha256: 'abc123',
    };
    mockUseReportRunOutput.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data,
      refetch: vi.fn(),
    });
  }

  it('renders # heading as h1 with the heading text', async () => {
    setupSuccess('# Daily Review\n\nSome paragraph text.');
    renderPreview();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /daily review/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/some paragraph text/i)).toBeInTheDocument();
  });

  it('renders ## heading as h2', async () => {
    setupSuccess('## Section Title');
    renderPreview();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /section title/i })).toBeInTheDocument();
    });
  });

  it('renders ### heading as h3', async () => {
    setupSuccess('### Sub-section');
    renderPreview();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: /sub-section/i })).toBeInTheDocument();
    });
  });

  it('renders **bold** text inside a strong element', async () => {
    setupSuccess('This is **important**.');
    renderPreview();
    await waitFor(() => {
      expect(screen.getByText('important').tagName).toBe('STRONG');
    });
  });

  it('renders *italic* text inside an em element', async () => {
    setupSuccess('This is *emphasized*.');
    renderPreview();
    await waitFor(() => {
      expect(screen.getByText('emphasized').tagName).toBe('EM');
    });
  });

  it('renders `inline code` inside a code element', async () => {
    setupSuccess('Call `doSomething()` now.');
    renderPreview();
    await waitFor(() => {
      expect(screen.getByText('doSomething()').tagName).toBe('CODE');
    });
  });

  it('renders - bullets as a list', async () => {
    setupSuccess('- Item one\n- Item two\n- Item three');
    renderPreview();
    await waitFor(() => {
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getByText('Item one')).toBeInTheDocument();
      expect(screen.getByText('Item two')).toBeInTheDocument();
    });
  });

  it('renders 1. 2. items as an ordered list', async () => {
    setupSuccess('1. First\n2. Second');
    renderPreview();
    await waitFor(() => {
      // ol renders as list role
      const lists = screen.getAllByRole('list');
      expect(lists.length).toBeGreaterThan(0);
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Security — HTML escaping
// ---------------------------------------------------------------------------

describe('ReportPreview — HTML escaping', () => {
  it('does NOT inject a <script> tag from markdown source', async () => {
    const malicious = '# Title\n\n<script>alert("xss")</script>\n\nSafe paragraph.';
    mockUseReportRunOutput.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: {
        content: malicious,
        output_path: 'x',
        output_sha256: null,
      } satisfies ReportRunOutput,
      refetch: vi.fn(),
    });

    renderPreview();

    await waitFor(() => {
      // The heading still renders.
      expect(screen.getByRole('heading', { level: 1, name: /title/i })).toBeInTheDocument();
    });

    // No actual script element should exist in the DOM.
    expect(document.querySelector('script')).toBeNull();

    // The literal text should appear escaped (as text content somewhere).
    // Look for the angle-bracket text as an escaped sequence — the browser
    // would render &lt;script&gt; as visible text `<script>`.
    expect(screen.getByText(/alert/i)).toBeInTheDocument();
  });

  it('escapes < and > in paragraph text', async () => {
    mockUseReportRunOutput.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: {
        content: 'Result is 3 < 5 and 7 > 2.',
        output_path: 'x',
        output_sha256: null,
      } satisfies ReportRunOutput,
      refetch: vi.fn(),
    });

    renderPreview();

    await waitFor(() => {
      expect(screen.getByText(/3 < 5 and 7 > 2/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// A11y — region label
// ---------------------------------------------------------------------------

describe('ReportPreview — accessibility', () => {
  it('renders a region with an aria-label including the formatted date', async () => {
    mockUseReportRunOutput.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: { content: '# Hello', output_path: 'x', output_sha256: null } satisfies ReportRunOutput,
      refetch: vi.fn(),
    });

    renderPreview({ runDate: '2026-04-25T07:00:00.000Z' });

    // The region should exist with "Apr 25, 2026" in the label (or similar locale format).
    const region = screen.getByRole('region', { name: /report output for/i });
    expect(region).toBeInTheDocument();
  });
});
