/**
 * ThreadsTab.test.tsx
 *
 * Tests for the Threads tab:
 *  - Shows empty state when no threads exist
 *  - Renders thread rows when data is present
 *  - Shows org name for each thread
 *  - Load more button appears when there are more results
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ThreadsTab } from './ThreadsTab';
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

interface MockThread {
  id: number;
  organization_id: number;
  title: string | null;
  started_at: string;
  last_message_at: string;
}

const mockThread: MockThread = {
  id: 42,
  organization_id: 10,
  title: 'Q2 planning discussion',
  started_at: '2026-04-20T09:00:00Z',
  last_message_at: '2026-04-26T14:30:00Z',
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Control per test
let _threadsData: MockThread[] | undefined = [mockThread];
let _threadsError = false;

vi.mock('../../api/useOrganizations', () => ({
  useOrganizations: vi.fn(() => ({
    data: [mockOrg],
  })),
}));

vi.mock('../../api/useAgentThreads', () => ({
  useAgentAudit: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  AgentAuditEntry: undefined,
}));

// The ThreadsTab defines its own useAllThreads hook inline using useQuery +
// request. We need to mock the http module that it uses.
vi.mock('../../api/http', () => ({
  request: vi.fn((_method: string, url: string) => {
    // The threads endpoint
    if (url.includes('/api/agents/threads')) {
      if (_threadsError) return Promise.reject(new Error('Network error'));
      return Promise.resolve(_threadsData ?? []);
    }
    return Promise.resolve([]);
  }),
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

function renderTab() {
  return render(<ThreadsTab />, { wrapper: makeWrapper() });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _threadsData = [mockThread];
  _threadsError = false;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('ThreadsTab — empty state', () => {
  it('shows empty state message when there are no threads', async () => {
    _threadsData = [];
    renderTab();
    await waitFor(() => {
      expect(
        screen.getByText(/no agent threads yet/i),
      ).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Rendering threads
// ---------------------------------------------------------------------------

describe('ThreadsTab — rendering threads', () => {
  it('renders thread titles', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Q2 planning discussion')).toBeDefined();
    });
  });

  it('renders the org name associated with the thread', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeDefined();
    });
  });

  it('shows fallback "Thread #N" when thread title is null', async () => {
    _threadsData = [{ ...mockThread, title: null }];
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/thread #42/i)).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Load more
// ---------------------------------------------------------------------------

describe('ThreadsTab — load more', () => {
  it('does not show Load more button when total results fit within page size', async () => {
    // PAGE_SIZE is 50; with only 1 thread, no Load more needed
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Q2 planning discussion')).toBeDefined();
    });
    // Load more should NOT be present
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('shows Load more button when there are more results than the page size', async () => {
    // Create PAGE_SIZE + 1 threads to trigger Load more
    const PAGE_SIZE = 50;
    _threadsData = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
      ...mockThread,
      id: i + 1,
      title: `Thread ${i + 1}`,
    }));
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /load more/i })).toBeDefined();
    });
  });

  it('Load more button click requests more threads', async () => {
    const PAGE_SIZE = 50;
    _threadsData = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
      ...mockThread,
      id: i + 1,
      title: `Thread ${i + 1}`,
    }));
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /load more/i })).toBeDefined();
    });
    await userEvent.click(screen.getByRole('button', { name: /load more/i }));
    // After clicking, limit increases — button disappears or more rows shown
    // (here all 51 are returned, so after bump to 100 limit, no more button)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
    });
  }, 10_000);
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('ThreadsTab — error state', () => {
  it('shows error message when fetch fails', async () => {
    _threadsError = true;
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
  });
});
