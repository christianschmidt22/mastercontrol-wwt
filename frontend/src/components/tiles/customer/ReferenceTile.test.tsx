/**
 * ReferenceTile.test.tsx
 *
 * Tests for the ReferenceTile empty-state and data-view rendering.
 * Hook injection via the _useOrganization prop — no real network calls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ReferenceTile } from './ReferenceTile';
import type { Organization } from '../../../types';

const orgWithData: Organization = {
  id: 10,
  type: 'customer',
  name: 'Fairview Health',
  metadata: {
    industry: 'Healthcare',
    portal_url: 'https://portal.fairview.example.com',
    locations: 'Minneapolis, Rochester',
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const orgWithNoMeta: Organization = {
  id: 10,
  type: 'customer',
  name: 'Fairview Health',
  metadata: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function makeHook(data: Organization | undefined, isLoading = false) {
  return (_orgId: number) => ({ data, isLoading });
}

describe('ReferenceTile — empty state', () => {
  it('shows empty-state copy when org is undefined and not loading', () => {
    render(
      <ReferenceTile orgId={10} _useOrganization={makeHook(undefined)} />,
    );
    expect(
      screen.getByText(
        'No reference data yet. Profile fills in as you add contacts, locations, and portals.',
      ),
    ).toBeInTheDocument();
  });

  it('shows empty-state copy when org has no metadata', () => {
    render(
      <ReferenceTile orgId={10} _useOrganization={makeHook(orgWithNoMeta)} />,
    );
    expect(
      screen.getByText(
        'No reference data yet. Profile fills in as you add contacts, locations, and portals.',
      ),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(
      <ReferenceTile orgId={10} _useOrganization={makeHook(undefined)} />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(
      <ReferenceTile orgId={10} _useOrganization={makeHook(undefined, true)} />,
    );
    expect(
      screen.queryByText(
        'No reference data yet. Profile fills in as you add contacts, locations, and portals.',
      ),
    ).toBeNull();
  });
});

describe('ReferenceTile — data view', () => {
  it('renders the three reference entry buttons when org has data', () => {
    render(
      <ReferenceTile orgId={10} _useOrganization={makeHook(orgWithData)} />,
    );
    expect(
      screen.getByRole('button', { name: 'Open Profile' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open Locations' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open Portals' }),
    ).toBeInTheDocument();
  });

  it('does not render empty state when org has metadata', () => {
    render(
      <ReferenceTile orgId={10} _useOrganization={makeHook(orgWithData)} />,
    );
    expect(
      screen.queryByText(
        'No reference data yet. Profile fills in as you add contacts, locations, and portals.',
      ),
    ).toBeNull();
  });
});
