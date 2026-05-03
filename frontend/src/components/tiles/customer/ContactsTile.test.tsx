/**
 * ContactsTile.test.tsx
 *
 * Tests for the ContactsTile component: empty-state, data-view, and
 * inline add-contact form. Hook injection via _useContacts / _useCreateContact
 * props — no real network calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactsTile } from './ContactsTile';
import type { Contact, ContactCreate } from '../../../types';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseContact: Contact = {
  id: 1,
  organization_id: 10,
  name: 'Alice Smith',
  title: 'CIO',
  email: 'alice@example.com',
  phone: null,
  role: 'account',
  created_at: '2026-01-01T00:00:00Z',
  assigned_org_ids: [],
};

function makeHook(data: Contact[] | undefined, isLoading = false) {
  return (_orgId: number) => ({ data, isLoading });
}

function makeMutationHook(mutate = vi.fn()) {
  return { hook: () => ({ mutate, isPending: false }), mutate };
}

function makeDeleteMutationHook(mutate = vi.fn()) {
  return { hook: () => ({ mutate, isPending: false }), mutate };
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe('ContactsTile — empty state', () => {
  it('shows empty-state copy when contacts array is empty', () => {
    renderWithClient(<ContactsTile orgId={10} _useContacts={makeHook([])} />);
    expect(
      screen.getByText('No contacts yet. Add the account team.'),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    renderWithClient(<ContactsTile orgId={10} _useContacts={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows Add contact button in empty state', () => {
    renderWithClient(<ContactsTile orgId={10} _useContacts={makeHook([])} />);
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    renderWithClient(<ContactsTile orgId={10} _useContacts={makeHook(undefined, true)} />);
    expect(
      screen.queryByText('No contacts yet. Add the account team.'),
    ).toBeNull();
  });
});

// ── Data view ─────────────────────────────────────────────────────────────────

describe('ContactsTile — data view', () => {
  it('renders contact names when data is present', () => {
    renderWithClient(<ContactsTile orgId={10} _useContacts={makeHook([baseContact])} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('does not render empty state when contacts exist', () => {
    renderWithClient(<ContactsTile orgId={10} _useContacts={makeHook([baseContact])} />);
    expect(
      screen.queryByText('No contacts yet. Add the account team.'),
    ).toBeNull();
  });

  it('requires confirmation before deleting a contact', async () => {
    const user = userEvent.setup();
    const { hook, mutate } = makeDeleteMutationHook();
    renderWithClient(
      <ContactsTile
        orgId={10}
        _useContacts={makeHook([baseContact])}
        _useDeleteContact={hook}
      />,
    );

    await user.hover(screen.getByText('Alice Smith'));
    await user.click(screen.getByRole('button', { name: 'Delete Alice Smith' }));

    expect(mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm delete Alice Smith' }));

    expect(mutate).toHaveBeenCalledWith(
      { id: baseContact.id, orgId: 10 },
      expect.any(Object),
    );
  });
});

// ── Inline add form ───────────────────────────────────────────────────────────

describe('ContactsTile — inline add form', () => {
  it('clicking Add contact opens the form; Cancel collapses it and clears fields', async () => {
    const user = userEvent.setup();
    renderWithClient(<ContactsTile orgId={10} _useContacts={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add contact' }));

    // All five form fields are present
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();

    // Cancel hides the form
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('shows validation error in aria-live region when name is empty on submit', async () => {
    const user = userEvent.setup();
    renderWithClient(<ContactsTile orgId={10} _useContacts={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Email'), 'bob@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Name is required.')).toBeInTheDocument();
  });

  it('save calls mutate with the expected payload', async () => {
    const user = userEvent.setup();
    const { hook, mutate } = makeMutationHook();
    renderWithClient(
      <ContactsTile
        orgId={10}
        _useContacts={makeHook([])}
        _useCreateContact={hook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'Bob Jones');
    await user.type(screen.getByLabelText('Title'), 'VP Sales');
    await user.type(screen.getByLabelText('Email'), 'bob@example.com');
    await user.selectOptions(screen.getByLabelText('Role'), 'account');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ContactCreate>>({
        organization_id: 10,
        name: 'Bob Jones',
        title: 'VP Sales',
        email: 'bob@example.com',
        role: 'account',
      }),
      expect.any(Object),
    );
  });

  it('cancel does not call mutate', async () => {
    const user = userEvent.setup();
    const { hook, mutate } = makeMutationHook();
    renderWithClient(
      <ContactsTile
        orgId={10}
        _useContacts={makeHook([])}
        _useCreateContact={hook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'Draft Person');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mutate).not.toHaveBeenCalled();
  });

  it('optimistically inserts new contact into the list before server responds', async () => {
    const user = userEvent.setup();
    // Start with one existing contact
    renderWithClient(
      <ContactsTile
        orgId={10}
        _useContacts={makeHook([baseContact])}
      />,
    );

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Carol White')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'Carol White');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // New contact appears immediately in the list
    expect(screen.getByText('Carol White')).toBeInTheDocument();
    // Existing contact is still there
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });
});
