/**
 * PersonalUsageTile.test.tsx
 *
 * Tests:
 *  - renders all four period tabs
 *  - shows period stats for the active tab
 *  - shows empty state when personal API key is not set
 *  - expands / collapses "Recent activity" on button click
 *  - recent activity list renders event rows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { PersonalUsageTile } from './PersonalUsageTile';
import type { UsageAggregate, UsageEvent } from '../../types/subagent';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock useSettings so we can control the personal_anthropic_api_key value
vi.mock('../../api/useSettings', () => ({
  useSetting: vi.fn(),
}));

// Mock useSubagent hooks
vi.mock('../../api/useSubagent', () => ({
  useUsage: vi.fn(),
  useRecentUsage: vi.fn(),
}));

import { useSetting } from '../../api/useSettings';
import { useUsage, useRecentUsage } from '../../api/useSubagent';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const SESSION_AGGREGATE: UsageAggregate = {
  period: 'session',
  session_start: '2026-04-26T00:00:00Z',
  requests: 3,
  input_tokens: 600,
  output_tokens: 300,
  total_tokens: 900,
  cost_usd: 0.0021,
  would_have_cost_usd: 0.0021,
  savings_usd: 0,
};

const TODAY_AGGREGATE: UsageAggregate = {
  period: 'today',
  requests: 10,
  input_tokens: 2000,
  output_tokens: 1000,
  total_tokens: 3000,
  cost_usd: 0.07,
  would_have_cost_usd: 0.07,
  savings_usd: 0,
};

const WEEK_AGGREGATE: UsageAggregate = {
  period: 'week',
  requests: 42,
  input_tokens: 10000,
  output_tokens: 5000,
  total_tokens: 15000,
  cost_usd: 1.23,
  would_have_cost_usd: 1.23,
  savings_usd: 0,
};

const ALL_AGGREGATE: UsageAggregate = {
  period: 'all',
  requests: 200,
  input_tokens: 50000,
  output_tokens: 25000,
  total_tokens: 75000,
  cost_usd: 5.678,
  would_have_cost_usd: 5.678,
  savings_usd: 0,
};

const RECENT_EVENTS: UsageEvent[] = [
  {
    id: 1,
    occurred_at: new Date(Date.now() - 60_000).toISOString(),
    source: 'chat',
    model: 'claude-sonnet-4-6',
    input_tokens: 100,
    output_tokens: 50,
    cost_usd: 0.0005,
    task_summary: null,
    error: null,
  },
  {
    id: 2,
    occurred_at: new Date(Date.now() - 3_600_000).toISOString(),
    source: 'delegate',
    model: 'claude-haiku-4-5',
    input_tokens: 80,
    output_tokens: 40,
    cost_usd: 0.0001,
    task_summary: 'Summarise org',
    error: null,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: qc }, children),
    );
  };
}

function setupMocks(opts: { hasKey?: boolean } = {}) {
  const hasKey = opts.hasKey ?? true;

  vi.mocked(useSetting).mockImplementation((key: string) => {
    if (key === 'personal_anthropic_api_key') {
      return {
        data: hasKey ? { key, value: '***ant1' } : undefined,
        isLoading: false,
      } as ReturnType<typeof useSetting>;
    }
    return { data: undefined, isLoading: false } as ReturnType<typeof useSetting>;
  });

  vi.mocked(useUsage).mockImplementation((period) => {
    const map: Record<string, UsageAggregate> = {
      session: SESSION_AGGREGATE,
      today: TODAY_AGGREGATE,
      week: WEEK_AGGREGATE,
      all: ALL_AGGREGATE,
    };
    return {
      data: map[period],
      isLoading: false,
      isSuccess: true,
    } as ReturnType<typeof useUsage>;
  });

  vi.mocked(useRecentUsage).mockReturnValue({
    data: RECENT_EVENTS,
    isLoading: false,
    isSuccess: true,
  } as ReturnType<typeof useRecentUsage>);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PersonalUsageTile — empty state', () => {
  it('renders empty state when personal key is not set', () => {
    setupMocks({ hasKey: false });

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    expect(screen.getByText(/No personal subscription configured/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Configure in Settings/i })).toBeTruthy();
  });

  it('empty state link points to settings', () => {
    setupMocks({ hasKey: false });

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const link = screen.getByRole('link', { name: /Configure in Settings/i });
    expect(link.getAttribute('href')).toContain('/settings');
  });
});

describe('PersonalUsageTile — with key configured', () => {
  it('renders the heading "Personal subscription"', () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    expect(screen.getByRole('heading', { name: /Personal subscription/i })).toBeTruthy();
  });

  it('renders all four period tabs', () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    expect(screen.getByRole('tab', { name: /Session/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Today/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Week/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /All time/i })).toBeTruthy();
  });

  it('session tab is selected by default', () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const sessionTab = screen.getByRole('tab', { name: /Session/i });
    expect(sessionTab.getAttribute('aria-selected')).toBe('true');
  });

  it('shows session stats (requests, tokens, cost) by default', () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    // requests
    expect(screen.getByText('3')).toBeTruthy();
    // cost — sub-cent should use 4 decimal places
    expect(screen.getByText('$0.0021')).toBeTruthy();
  });

  it('switches to Today tab and shows today stats', async () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const todayTab = screen.getByRole('tab', { name: /Today/i });
    fireEvent.click(todayTab);

    await waitFor(() => {
      expect(todayTab.getAttribute('aria-selected')).toBe('true');
    });

    // today cost = $0.07
    expect(screen.getByText('$0.07')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy(); // requests
  });

  it('switches to Week tab and shows week stats', async () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const weekTab = screen.getByRole('tab', { name: /Week/i });
    fireEvent.click(weekTab);

    await waitFor(() => {
      expect(weekTab.getAttribute('aria-selected')).toBe('true');
    });

    expect(screen.getByText('$1.23')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('switches to All time tab and shows all-time stats', async () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const allTab = screen.getByRole('tab', { name: /All time/i });
    fireEvent.click(allTab);

    await waitFor(() => {
      expect(allTab.getAttribute('aria-selected')).toBe('true');
    });

    expect(screen.getByText('$5.68')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
  });

  it('status dot has aria-label', () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const dot = screen.getByRole('img', { name: /subscription/i });
    expect(dot).toBeTruthy();
  });
});

describe('PersonalUsageTile — recent activity', () => {
  it('recent activity section is collapsed by default', () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const btn = screen.getByRole('button', { name: /Recent activity/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands recent activity on click and shows event rows', async () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const btn = screen.getByRole('button', { name: /Recent activity/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn.getAttribute('aria-expanded')).toBe('true');
    });

    // Source pills
    expect(screen.getByText('chat')).toBeTruthy();
    expect(screen.getByText('delegate')).toBeTruthy();
  });

  it('collapses recent activity on second click', async () => {
    setupMocks();

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const btn = screen.getByRole('button', { name: /Recent activity/i });

    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute('aria-expanded')).toBe('true'));

    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute('aria-expanded')).toBe('false'));
  });

  it('shows "No recent activity" when event list is empty', async () => {
    setupMocks();
    const emptyEvents: UsageEvent[] = [];
    vi.mocked(useRecentUsage).mockReturnValue({
      data: emptyEvents,
      isLoading: false,
      isSuccess: true,
    } as ReturnType<typeof useRecentUsage>);

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    const btn = screen.getByRole('button', { name: /Recent activity/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/No recent activity/i)).toBeTruthy();
    });
  });
});

describe('PersonalUsageTile — loading state', () => {
  it('shows skeleton bars when usage data is loading', () => {
    vi.mocked(useSetting).mockReturnValue({
      data: { key: 'personal_anthropic_api_key', value: '***ant1' },
      isLoading: false,
    } as ReturnType<typeof useSetting>);

    vi.mocked(useUsage).mockReturnValue({
      data: undefined,
      isLoading: true,
      isSuccess: false,
    } as ReturnType<typeof useUsage>);

    vi.mocked(useRecentUsage).mockReturnValue({
      data: undefined,
      isLoading: true,
      isSuccess: false,
    } as ReturnType<typeof useRecentUsage>);

    render(<PersonalUsageTile />, { wrapper: makeWrapper() });

    // With loading state there should be skeleton placeholder elements (aria-hidden)
    const skeletons = document.querySelectorAll('[aria-hidden="true"]');
    // At minimum the chevron icon and skeleton bars should be present
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
