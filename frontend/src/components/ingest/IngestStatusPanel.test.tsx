/**
 * IngestStatusPanel.test.tsx
 *
 * Tests for IngestStatusPanel — renders status counters, scan button
 * disabled while scanning, scan button calls mutate on click.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useIngestStatus and useIngestScan
// ---------------------------------------------------------------------------

const mockScanMutate = vi.fn();
let mockScanIsPending = false;
let mockScanIsSuccess = false;
let mockScanData: { files_scanned: number; inserted: number; updated: number; touched: number; tombstoned: number; conflicts: number; errors: number } | undefined = undefined;
let mockScanError: Error | null = null;

const mockStatus = {
  data: undefined as
    | { source: { id: number; root_path: string; kind: string; last_scan_at: string | null; created_at: string } | null; errors: unknown[] }
    | undefined,
  isLoading: false,
};

vi.mock('../../api/useIngest', () => ({
  useIngestStatus: () => mockStatus,
  useIngestScan: () => ({
    mutate: mockScanMutate,
    isPending: mockScanIsPending,
    isSuccess: mockScanIsSuccess,
    isError: !!mockScanError,
    error: mockScanError,
    data: mockScanData,
  }),
}));

import { IngestStatusPanel } from './IngestStatusPanel';

beforeEach(() => {
  mockScanMutate.mockReset();
  mockScanIsPending = false;
  mockScanIsSuccess = false;
  mockScanData = undefined;
  mockScanError = null;
  mockStatus.data = undefined;
  mockStatus.isLoading = false;
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('IngestStatusPanel — rendering', () => {
  it('renders the "Scan Now" button at rest', () => {
    render(<IngestStatusPanel />);
    expect(screen.getByRole('button', { name: /scan workvault now/i })).toBeInTheDocument();
  });

  it('shows "Never" for last scan when no source exists', () => {
    mockStatus.data = { source: null, errors: [] };
    render(<IngestStatusPanel />);
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('shows "None" for errors when there are no errors', () => {
    mockStatus.data = { source: null, errors: [] };
    render(<IngestStatusPanel />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('shows error count when errors exist', () => {
    mockStatus.data = {
      source: null,
      errors: [
        { id: 1, source_id: 1, path: '/a.md', error: 'e', occurred_at: '2026-01-01T00:00:00Z' },
        { id: 2, source_id: 1, path: '/b.md', error: 'e', occurred_at: '2026-01-01T00:00:00Z' },
      ],
    };
    render(<IngestStatusPanel />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows loading placeholder while loading', () => {
    mockStatus.isLoading = true;
    render(<IngestStatusPanel />);
    // Should show "…" placeholders while loading
    const ellipses = screen.getAllByText('…');
    expect(ellipses.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('IngestStatusPanel — interactions', () => {
  it('calls scan.mutate when "Scan Now" is clicked', () => {
    render(<IngestStatusPanel />);
    fireEvent.click(screen.getByRole('button', { name: /scan workvault now/i }));
    expect(mockScanMutate).toHaveBeenCalledOnce();
  });

  it('scan button is disabled while scan is in progress', () => {
    mockScanIsPending = true;
    render(<IngestStatusPanel />);
    const btn = screen.getByRole('button', { name: /scan in progress/i });
    expect(btn).toBeDisabled();
  });

  it('shows "Scanning…" label while pending', () => {
    mockScanIsPending = true;
    render(<IngestStatusPanel />);
    expect(screen.getByText('Scanning…')).toBeInTheDocument();
  });

  it('shows last-run summary after a successful scan', () => {
    mockScanIsSuccess = true;
    mockScanData = {
      files_scanned: 10,
      inserted: 3,
      updated: 1,
      touched: 6,
      tombstoned: 0,
      conflicts: 0,
      errors: 0,
    };
    render(<IngestStatusPanel />);
    // The summary line should contain "3 inserted" and "1 updated"
    expect(screen.getByText(/3 inserted/i)).toBeInTheDocument();
  });
});
