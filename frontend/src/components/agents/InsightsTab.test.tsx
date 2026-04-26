/**
 * InsightsTab.test.tsx
 *
 * Tests for the Insights queue tab:
 *  - Renders empty state when no insights
 *  - Renders insight rows when data is present
 *  - Accept button calls confirmMutation
 *  - Dismiss button calls rejectMutation
 *  - Checkboxes select insights for bulk actions
 *  - Live region announces count
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { InsightsTab } from './InsightsTab';
import type { Note } from '../../types';
import type { Organization } from '../../types';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockOrg: Organization = {
  id: 10,
  type: 'customer',
  name: 'Acme Corp',
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockInsightNote: Note = {
  id: 101,
  organization_id: 10,
  content: 'Acme is expanding their network infrastructure.',
  ai_response: null,
  source_path: null,
  file_mtime: null,
  role: 'agent_insight',
  thread_id: 5,
  provenance: { source_thread_id: 5 },
  confirmed: false,
  created_at: '2026-04-26T10:00:00Z',
};

const mockConfirmedNote: Note = {
  ...mockInsightNote,
  id: 102,
  confirmed: true,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConfirmMutateAsync = vi.fn().mockResolvedValue({});
const mockRejectMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('../../api/useOrganizations', () => ({
  useOrganizations: vi.fn(() => ({
    data: [mockOrg],
    isLoading: false,
  })),
}));

// We control what useNotes returns per test via this ref
let _notesData: Note[] = [mockInsightNote];

vi.mock('../../api/useNotes', () => ({
  useNotes: vi.fn((orgId: number, opts?: { includeUnconfirmed?: boolean }) => {
    void orgId;
    void opts;
    return { data: _notesData };
  }),
  useConfirmInsight: vi.fn(() => ({
    mutateAsync: mockConfirmMutateAsync,
    isPending: false,
  })),
  useRejectInsight: vi.fn(() => ({
    mutateAsync: mockRejectMutateAsync,
    isPending: false,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function renderTab(onCountChange?: (n: number) => void) {
  return render(<InsightsTab onCountChange={onCountChange} />, {
    wrapper: makeWrapper(),
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _notesData = [mockInsightNote];
  vi.clearAllMocks();
  mockConfirmMutateAsync.mockResolvedValue({});
  mockRejectMutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('InsightsTab — empty state', () => {
  it('shows empty state message when there are no unconfirmed insights', () => {
    _notesData = [mockConfirmedNote]; // only confirmed — no unconfirmed
    renderTab();
    expect(
      screen.getByText(/no agent insights waiting for review/i),
    ).toBeDefined();
  });

  it('shows empty state when notes array is empty', () => {
    _notesData = [];
    renderTab();
    expect(
      screen.getByText(/no agent insights waiting for review/i),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Rendering with insights
// ---------------------------------------------------------------------------

describe('InsightsTab — rendering insights', () => {
  it('renders the insight content', async () => {
    renderTab();
    await waitFor(() => {
      expect(
        screen.getByText(/acme is expanding their network infrastructure/i),
      ).toBeDefined();
    });
  });

  it('renders the org name for each insight', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0);
    });
  });

  it('renders Accept and Dismiss buttons for each insight', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /accept insight from acme corp/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /dismiss insight from acme corp/i })).toBeDefined();
    });
  });

  it('renders a checkbox for bulk selection', async () => {
    renderTab();
    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Accept action
// ---------------------------------------------------------------------------

describe('InsightsTab — accept', () => {
  it('clicking Accept calls confirmMutation with the correct note id and orgId', async () => {
    renderTab();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /accept insight from acme corp/i }),
      ).toBeDefined();
    });

    await userEvent.click(
      screen.getByRole('button', { name: /accept insight from acme corp/i }),
    );

    await waitFor(() => {
      expect(mockConfirmMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockConfirmMutateAsync).toHaveBeenCalledWith({
      id: 101,
      orgId: 10,
    });
  });
});

// ---------------------------------------------------------------------------
// Dismiss action
// ---------------------------------------------------------------------------

describe('InsightsTab — dismiss', () => {
  it('clicking Dismiss calls rejectMutation with the correct note id and orgId', async () => {
    renderTab();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /dismiss insight from acme corp/i }),
      ).toBeDefined();
    });

    await userEvent.click(
      screen.getByRole('button', { name: /dismiss insight from acme corp/i }),
    );

    await waitFor(() => {
      expect(mockRejectMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockRejectMutateAsync).toHaveBeenCalledWith({
      id: 101,
      orgId: 10,
    });
  });
});

// ---------------------------------------------------------------------------
// Count callback
// ---------------------------------------------------------------------------

describe('InsightsTab — count callback', () => {
  it('calls onCountChange with the number of unconfirmed insights', async () => {
    const onCountChange = vi.fn();
    renderTab(onCountChange);
    await waitFor(() => {
      expect(onCountChange).toHaveBeenCalledWith(1);
    });
  });

  it('calls onCountChange(0) when there are no insights', async () => {
    _notesData = [];
    const onCountChange = vi.fn();
    renderTab(onCountChange);
    await waitFor(() => {
      expect(onCountChange).toHaveBeenCalledWith(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Bulk select
// ---------------------------------------------------------------------------

describe('InsightsTab — bulk select', () => {
  it('checking the insight checkbox reveals the bulk action bar', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
    });

    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]!);

    await waitFor(() => {
      // The bulk region has aria-label="Bulk actions"
      expect(screen.getByRole('region', { name: /bulk actions/i })).toBeDefined();
    });
  });
});
