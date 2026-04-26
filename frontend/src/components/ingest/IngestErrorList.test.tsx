/**
 * IngestErrorList.test.tsx
 *
 * Tests for IngestErrorList — renders rows, retry button calls mutation,
 * empty state, and loading state.
 *
 * Hooks are injected via module mocking so no network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useRetryIngestError so tests can control mutation state.
// ---------------------------------------------------------------------------

const mockMutate = vi.fn();
let mockIsPending = false;
let mockVariables: number | undefined = undefined;

vi.mock('../../api/useIngest', () => ({
  useRetryIngestError: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
    variables: mockVariables,
  }),
}));

import { IngestErrorList } from './IngestErrorList';
import type { IngestError } from '../../types/ingest';

const baseError: IngestError = {
  id: 1,
  source_id: 10,
  path: 'C:\\Users\\schmichr\\WorkVault\\meeting.md',
  error: 'read-failed: ENOENT no such file',
  occurred_at: '2026-04-26T10:00:00.000Z',
};

beforeEach(() => {
  mockMutate.mockReset();
  mockIsPending = false;
  mockVariables = undefined;
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('IngestErrorList — empty state', () => {
  it('shows empty-state copy when errors array is empty', () => {
    render(<IngestErrorList errors={[]} isLoading={false} />);
    expect(
      screen.getByText('No ingest errors — all files processed successfully.'),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(<IngestErrorList errors={[]} isLoading={false} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows loading text while loading', () => {
    render(<IngestErrorList errors={undefined} isLoading={true} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(<IngestErrorList errors={undefined} isLoading={true} />);
    expect(
      screen.queryByText('No ingest errors — all files processed successfully.'),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Data view
// ---------------------------------------------------------------------------

describe('IngestErrorList — data view', () => {
  it('renders the error message text', () => {
    render(<IngestErrorList errors={[baseError]} isLoading={false} />);
    expect(screen.getByText('read-failed: ENOENT no such file')).toBeInTheDocument();
  });

  it('renders a retry button for each error row', () => {
    render(<IngestErrorList errors={[baseError]} isLoading={false} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('retry button has an aria-label containing the file path', () => {
    render(<IngestErrorList errors={[baseError]} isLoading={false} />);
    const btn = screen.getByRole('button', { name: /retry/i });
    expect(btn.getAttribute('aria-label')).toContain('meeting.md');
  });

  it('calls mutate with the error id when retry button is clicked', () => {
    render(<IngestErrorList errors={[baseError]} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockMutate).toHaveBeenCalledWith(1);
  });

  it('retry button is disabled while a retry is in progress for that row', () => {
    mockIsPending = true;
    mockVariables = 1;
    render(<IngestErrorList errors={[baseError]} isLoading={false} />);
    const btn = screen.getByRole('button', { name: /retrying/i });
    expect(btn).toBeDisabled();
  });

  it('retry button is NOT disabled for a different row while another retries', () => {
    const second: IngestError = { ...baseError, id: 2, path: '/other/file.md' };
    mockIsPending = true;
    mockVariables = 1; // row 1 is retrying
    render(<IngestErrorList errors={[baseError, second]} isLoading={false} />);
    const buttons = screen.getAllByRole('button');
    // The second button (row 2) should not be disabled
    expect(buttons[1]).not.toBeDisabled();
  });

  it('the list container has role="status" and aria-live="polite"', () => {
    render(<IngestErrorList errors={[baseError]} isLoading={false} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });
});
