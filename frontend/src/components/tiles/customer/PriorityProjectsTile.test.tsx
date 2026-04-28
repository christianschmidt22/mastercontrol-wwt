/**
 * PriorityProjectsTile.test.tsx
 *
 * Tests for the PriorityProjectsTile: empty-state, data-view, and
 * inline add-project form. Hook injection via _useProjects / _useCreateProject
 * props — no real network calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PriorityProjectsTile } from './PriorityProjectsTile';
import type { Project, ProjectCreate } from '../../../types';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

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

function makeMutationHook(mutate = vi.fn()) {
  return { hook: () => ({ mutate, isPending: false }), mutate };
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe('PriorityProjectsTile — empty state', () => {
  it('shows empty-state copy when no active/qualifying projects', () => {
    renderWithClient(<PriorityProjectsTile orgId={10} _useProjects={makeHook([])} />);
    expect(
      screen.getByText('No open projects. Add one when an engagement starts.'),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    renderWithClient(<PriorityProjectsTile orgId={10} _useProjects={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state when all projects are non-open statuses', () => {
    renderWithClient(
      <PriorityProjectsTile orgId={10} _useProjects={makeHook([wonProject])} />,
    );
    expect(
      screen.getByText('No open projects. Add one when an engagement starts.'),
    ).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    renderWithClient(
      <PriorityProjectsTile orgId={10} _useProjects={makeHook(undefined, true)} />,
    );
    expect(
      screen.queryByText('No open projects. Add one when an engagement starts.'),
    ).toBeNull();
  });
});

// ── Data view ─────────────────────────────────────────────────────────────────

describe('PriorityProjectsTile — data view', () => {
  it('renders active project name when data is present', () => {
    renderWithClient(
      <PriorityProjectsTile orgId={10} _useProjects={makeHook([activeProject])} />,
    );
    expect(screen.getByText('Storage Refresh')).toBeInTheDocument();
  });

  it('does not render empty state when active projects exist', () => {
    renderWithClient(
      <PriorityProjectsTile orgId={10} _useProjects={makeHook([activeProject])} />,
    );
    expect(
      screen.queryByText('No open projects. Add one when an engagement starts.'),
    ).toBeNull();
  });

  it('filters non-active projects out of the list', () => {
    renderWithClient(
      <PriorityProjectsTile
        orgId={10}
        _useProjects={makeHook([activeProject, wonProject])}
      />,
    );
    expect(screen.getByText('Storage Refresh')).toBeInTheDocument();
    expect(screen.queryByText('Old Deal')).toBeNull();
  });
});

// ── Inline add form ───────────────────────────────────────────────────────────

describe('PriorityProjectsTile — inline add form', () => {
  it('clicking Add project opens the form; Cancel collapses it', async () => {
    const user = userEvent.setup();
    renderWithClient(<PriorityProjectsTile orgId={10} _useProjects={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add project' }));

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('shows validation error in aria-live region when name is empty on submit', async () => {
    const user = userEvent.setup();
    renderWithClient(<PriorityProjectsTile orgId={10} _useProjects={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Name is required.')).toBeInTheDocument();
  });

  it('save calls mutate with the expected payload', async () => {
    const user = userEvent.setup();
    const { hook, mutate } = makeMutationHook();
    renderWithClient(
      <PriorityProjectsTile
        orgId={10}
        _useProjects={makeHook([])}
        _useCreateProject={hook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await user.type(screen.getByLabelText('Name'), 'Network Upgrade');
    await user.selectOptions(screen.getByLabelText('Status'), 'qualifying');
    await user.type(screen.getByLabelText('Description'), 'Core switch refresh');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProjectCreate>>({
        organization_id: 10,
        name: 'Network Upgrade',
        status: 'qualifying',
        description: 'Core switch refresh',
      }),
      expect.any(Object),
    );
  });

  it('cancel does not call mutate', async () => {
    const user = userEvent.setup();
    const { hook, mutate } = makeMutationHook();
    renderWithClient(
      <PriorityProjectsTile
        orgId={10}
        _useProjects={makeHook([])}
        _useCreateProject={hook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await user.type(screen.getByLabelText('Name'), 'Draft Project');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mutate).not.toHaveBeenCalled();
  });

  it('optimistically inserts active project into the priority list before server responds', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <PriorityProjectsTile
        orgId={10}
        _useProjects={makeHook([activeProject])}
      />,
    );

    expect(screen.getByText('Storage Refresh')).toBeInTheDocument();
    expect(screen.queryByText('New Security Initiative')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await user.type(screen.getByLabelText('Name'), 'New Security Initiative');
    // status defaults to 'active' — will pass the OPEN_STATUSES filter
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Optimistic item appears immediately alongside the existing project
    expect(screen.getByText('New Security Initiative')).toBeInTheDocument();
    expect(screen.getByText('Storage Refresh')).toBeInTheDocument();
  });

  it('optimistic project with non-priority status does not appear in the list', async () => {
    const user = userEvent.setup();
    renderWithClient(<PriorityProjectsTile orgId={10} _useProjects={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await user.type(screen.getByLabelText('Name'), 'Closed Deal');
    await user.selectOptions(screen.getByLabelText('Status'), 'closed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // 'closed' is not in OPEN_STATUSES so it won't show in Open Projects
    expect(screen.queryByText('Closed Deal')).toBeNull();
  });
});
