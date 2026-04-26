/**
 * InsightsTab.test.tsx
 *
 * Tests for the Insights queue tab. Mocks the cross-org aggregator hook
 * `useUnconfirmedInsightsAcrossOrgs` introduced when Gap #2 was fixed.
 *
 * Covered:
 *  - Empty state when there are no unconfirmed insights
 *  - Renders insight rows when data is present
 *  - Accept button calls confirmMutation
 *  - Dismiss button calls rejectMutation
 *  - Bulk select reveals the action bar
 *  - onCountChange callback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { InsightsTab } from './InsightsTab';
import type { NoteWithOrg } from '../../types';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockInsight: NoteWithOrg = {
  id: 101,
  organization_id: 10,
  org_name: 'Acme Corp',
  org_type: 'customer',
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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConfirmMutateAsync = vi.fn().mockResolvedValue({});
const mockRejectMutateAsync = vi.fn().mockResolvedValue(undefined);

// What the aggregator returns; tests can mutate this between cases.
let _aggregatorData: NoteWithOrg[] = [mockInsight];

vi.mock('../../api/useNotes', () => ({
  useUnconfirmedInsightsAcrossOrgs: vi.fn(() => ({
    data: _aggregatorData,
    isLoading: false,
  })),
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
  _aggregatorData = [mockInsight];
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
  it('shows empty state when aggregator returns no insights', () => {
    _aggregatorData = [];
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
      expect(
        screen.getByRole('button', { name: /accept insight from acme corp/i }),
      ).toBeDefined();
      expect(
        screen.getByRole('button', { name: /dismiss insight from acme corp/i }),
      ).toBeDefined();
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
    _aggregatorData = [];
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
      expect(screen.getByRole('region', { name: /bulk actions/i })).toBeDefined();
    });
  });
});
