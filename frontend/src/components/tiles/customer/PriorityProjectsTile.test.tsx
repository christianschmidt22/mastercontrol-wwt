/**
 * PriorityProjectsTile.test.tsx
 *
 * Tests for the PriorityProjectsTile empty-state and data-view rendering.
 * Hook injection via the _useProjects prop — no real network calls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PriorityProjectsTile } from './PriorityProjectsTile';
import type { Project } from '../../../types';

const activeProject: Project = {
  id: 1,
  organization_id: 10,
  name: 'Storage Refresh',
  status: 'active',
  description: 'Flash refresh for primary datacenter',
  doc_url: null,
  notes_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const wonProject: Project = {
  ...activeProject,
  id: 2,
  name: 'Old Deal',
  status: 'won',
};

function makeHook(data: Project[] | undefined, isLoading = false) {
  return (_orgId: number) => ({ data, isLoading });
}

describe('PriorityProjectsTile — empty state', () => {
  it('shows empty-state copy when no active/qualifying projects', () => {
    render(
      <PriorityProjectsTile orgId={10} _useProjects={makeHook([])} />,
    );
    expect(
      screen.getByText('No projects on record. Add one when an engagement starts.'),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(<PriorityProjectsTile orgId={10} _useProjects={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state when all projects are non-active statuses', () => {
    render(
      <PriorityProjectsTile orgId={10} _useProjects={makeHook([wonProject])} />,
    );
    expect(
      screen.getByText('No projects on record. Add one when an engagement starts.'),
    ).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(
      <PriorityProjectsTile orgId={10} _useProjects={makeHook(undefined, true)} />,
    );
    expect(
      screen.queryByText('No projects on record. Add one when an engagement starts.'),
    ).toBeNull();
  });
});

describe('PriorityProjectsTile — data view', () => {
  it('renders active project name when data is present', () => {
    render(
      <PriorityProjectsTile orgId={10} _useProjects={makeHook([activeProject])} />,
    );
    expect(screen.getByText('Storage Refresh')).toBeInTheDocument();
  });

  it('does not render empty state when active projects exist', () => {
    render(
      <PriorityProjectsTile orgId={10} _useProjects={makeHook([activeProject])} />,
    );
    expect(
      screen.queryByText('No projects on record. Add one when an engagement starts.'),
    ).toBeNull();
  });

  it('filters non-active projects out of the list', () => {
    render(
      <PriorityProjectsTile
        orgId={10}
        _useProjects={makeHook([activeProject, wonProject])}
      />,
    );
    expect(screen.getByText('Storage Refresh')).toBeInTheDocument();
    expect(screen.queryByText('Old Deal')).toBeNull();
  });
});
