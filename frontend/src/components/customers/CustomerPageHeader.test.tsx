/**
 * CustomerPageHeader.test.tsx
 *
 * Header rendering and last-touched formatting.
 *   1. renders the org name in an h1
 *   2. renders the org type status pill
 *   3. formatLastTouched — "just now" for very recent
 *   4. formatLastTouched — relative days (2 days ago)
 *   5. shows "Click to add summary" empty state when no metadata.summary
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  CustomerPageHeader,
  formatLastTouched,
  type CustomerPageHeaderProps,
} from './CustomerPageHeader';
import type { Organization } from '../../types';

const baseOrg: Organization = {
  id: 1,
  type: 'customer',
  name: 'Fairview Health',
  metadata: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderHeader(overrides: Partial<CustomerPageHeaderProps> = {}) {
  // The header now uses useUpdateOrganization, which needs a QueryClientProvider.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CustomerPageHeader org={baseOrg} {...overrides} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('CustomerPageHeader — rendering', () => {
  it('renders the org name in an h1', () => {
    renderHeader();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fairview Health');
  });

  it('renders the org type as a status pill', () => {
    renderHeader();
    expect(screen.getByText('customer')).toBeInTheDocument();
  });

  it('shows empty-state summary button when metadata.summary is absent', () => {
    renderHeader({ org: { ...baseOrg, metadata: null } });
    expect(screen.getByText('Click to add summary')).toBeInTheDocument();
  });

  it('shows summary text when metadata.summary is present', () => {
    renderHeader({
      org: { ...baseOrg, metadata: { summary: 'Premier health network in the Midwest.' } },
    });
    expect(screen.getByText('Premier health network in the Midwest.')).toBeInTheDocument();
    expect(screen.queryByText('Click to add summary')).toBeNull();
  });

  it('hides the org summary row when project tabs are supplied', () => {
    renderHeader({
      org: { ...baseOrg, metadata: { summary: 'Premier health network in the Midwest.' } },
      tabs: <div role="tablist" aria-label="Customer pages"><button role="tab">Home</button></div>,
    });
    expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByText('Premier health network in the Midwest.')).toBeNull();
  });

  it('does not render the removed top-level action buttons', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: /edit organization/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add new note/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /open chat thread/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatLastTouched
// ---------------------------------------------------------------------------

describe('formatLastTouched', () => {
  it('returns "just now" for a timestamp within the last minute', () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    expect(formatLastTouched(recent)).toBe('just now');
  });

  it('returns "just now" for future-dated timestamps (clock skew)', () => {
    const future = new Date(Date.now() + 5_000).toISOString();
    expect(formatLastTouched(future)).toBe('just now');
  });

  it('returns "X min ago" for timestamps a few minutes old', () => {
    const fiveMin = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatLastTouched(fiveMin)).toBe('5 min ago');
  });

  it('returns "X hr ago" for timestamps a few hours old', () => {
    const threeHr = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatLastTouched(threeHr)).toBe('3 hr ago');
  });

  it('returns "X days ago" for timestamps multiple days old', () => {
    const twoDays = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatLastTouched(twoDays)).toBe('2 days ago');
  });

  it('returns "1 day ago" (singular) for exactly one day', () => {
    const oneDay = new Date(Date.now() - 1 * 24 * 60 * 60_000 - 60_000).toISOString();
    expect(formatLastTouched(oneDay)).toBe('1 day ago');
  });

  it('returns "Never touched" for null', () => {
    expect(formatLastTouched(null)).toBe('Never touched');
  });

  it('returns "Never touched" for undefined', () => {
    expect(formatLastTouched(undefined)).toBe('Never touched');
  });
});
