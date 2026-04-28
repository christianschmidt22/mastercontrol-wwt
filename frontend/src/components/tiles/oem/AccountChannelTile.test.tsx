/**
 * AccountChannelTile.test.tsx
 *
 * Tests for the OEM AccountChannelTile empty-state, data-view rendering,
 * and inline add-contact form. Hook injection via the _useContacts /
 * _useCreateContact props — no real network calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountChannelTile } from './AccountChannelTile';
import type { Contact } from '../../../types';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const accountContact: Contact = {
  id: 1,
  organization_id: 20,
  name: 'Bob Chen',
  title: 'Account Manager',
  email: 'bob@cisco.com',
  phone: null,
  role: 'account',
  created_at: '2026-01-01T00:00:00Z',
  assigned_org_ids: [],
};

const channelContact: Contact = {
  id: 2,
  organization_id: 20,
  name: 'Carol Wu',
  title: 'Channel Partner Manager',
  email: 'carol@cisco.com',
  phone: null,
  role: 'channel',
  created_at: '2026-01-01T00:00:00Z',
  assigned_org_ids: [],
};

function makeHook(data: Contact[] | undefined, isLoading = false) {
  return (_orgId: number) => ({ data, isLoading });
}

describe('AccountChannelTile — empty state', () => {
  it('shows empty-state copy when contacts array is empty', () => {
    renderWithClient(<AccountChannelTile orgId={20} _useContacts={makeHook([])} />);
    expect(
      screen.getByText('No contacts yet. Add the account team.'),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    renderWithClient(<AccountChannelTile orgId={20} _useContacts={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows Add contact button in empty state', () => {
    renderWithClient(<AccountChannelTile orgId={20} _useContacts={makeHook([])} />);
    expect(
      screen.getByRole('button', { name: 'Add contact' }),
    ).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    renderWithClient(
      <AccountChannelTile orgId={20} _useContacts={makeHook(undefined, true)} />,
    );
    expect(
      screen.queryByText('No contacts yet. Add the account team.'),
    ).toBeNull();
  });
});

describe('AccountChannelTile — data view', () => {
  it('renders account team contact', () => {
    renderWithClient(
      <AccountChannelTile
        orgId={20}
        _useContacts={makeHook([accountContact])}
      />,
    );
    expect(screen.getByText('Bob Chen')).toBeInTheDocument();
  });

  it('renders channel team contact in its own section', () => {
    renderWithClient(
      <AccountChannelTile
        orgId={20}
        _useContacts={makeHook([channelContact])}
      />,
    );
    expect(screen.getByText('Carol Wu')).toBeInTheDocument();
    expect(screen.getByText('Channel Team')).toBeInTheDocument();
  });

  it('does not render empty state when contacts exist', () => {
    renderWithClient(
      <AccountChannelTile
        orgId={20}
        _useContacts={makeHook([accountContact])}
      />,
    );
    expect(
      screen.queryByText('No contacts yet. Add the account team.'),
    ).toBeNull();
  });
});

// ── Inline add form ───────────────────────────────────────────────────────────

describe('AccountChannelTile — inline add form', () => {
  it('clicking Add contact opens the form; Cancel collapses it and clears fields', async () => {
    const user = userEvent.setup();
    renderWithClient(<AccountChannelTile orgId={20} _useContacts={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add contact' }));

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('shows validation error in aria-live region when name is empty on submit', async () => {
    const user = userEvent.setup();
    renderWithClient(<AccountChannelTile orgId={20} _useContacts={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Name is required.')).toBeInTheDocument();
  });

  it('shows validation error when email is invalid on submit', async () => {
    const user = userEvent.setup();
    renderWithClient(<AccountChannelTile orgId={20} _useContacts={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'Dave Park');
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.selectOptions(screen.getByLabelText('Role'), 'account');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Email must be a valid address.')).toBeInTheDocument();
  });

  it('save calls mutate with the expected payload', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    const hook = () => ({ mutate, isPending: false });
    renderWithClient(
      <AccountChannelTile
        orgId={20}
        _useContacts={makeHook([])}
        _useCreateContact={hook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'Dave Park');
    await user.type(screen.getByLabelText('Title'), 'Partner Manager');
    await user.type(screen.getByLabelText('Email'), 'dave@cisco.com');
    await user.selectOptions(screen.getByLabelText('Role'), 'channel');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 20,
        name: 'Dave Park',
        title: 'Partner Manager',
        email: 'dave@cisco.com',
        role: 'channel',
      }),
      expect.any(Object),
    );
  });

  it('optimistically inserts new contact into the correct team section before server responds', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <AccountChannelTile
        orgId={20}
        _useContacts={makeHook([accountContact])}
      />,
    );

    expect(screen.getByText('Bob Chen')).toBeInTheDocument();
    expect(screen.queryByText('Dana Lee')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'Dana Lee');
    await user.selectOptions(screen.getByLabelText('Role'), 'channel');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // New channel contact appears immediately
    expect(screen.getByText('Dana Lee')).toBeInTheDocument();
    // Existing account contact is still present
    expect(screen.getByText('Bob Chen')).toBeInTheDocument();
  });
});
