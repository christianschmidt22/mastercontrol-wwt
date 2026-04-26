/**
 * ContactsTile.test.tsx
 *
 * Tests for the ContactsTile component empty-state and data-view rendering.
 * Hook injection via the _useContacts prop — no real network calls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ContactsTile } from './ContactsTile';
import type { Contact } from '../../../types';

const baseContact: Contact = {
  id: 1,
  organization_id: 10,
  name: 'Alice Smith',
  title: 'CIO',
  email: 'alice@example.com',
  phone: null,
  role: 'account',
  created_at: '2026-01-01T00:00:00Z',
};

function makeHook(data: Contact[] | undefined, isLoading = false) {
  return (_orgId: number) => ({ data, isLoading });
}

describe('ContactsTile — empty state', () => {
  it('shows empty-state copy when contacts array is empty', () => {
    render(
      <ContactsTile
        orgId={10}
        _useContacts={makeHook([])}
      />,
    );
    expect(
      screen.getByText('No contacts yet. Add the account team.'),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(<ContactsTile orgId={10} _useContacts={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows Add contact button in empty state', () => {
    render(<ContactsTile orgId={10} _useContacts={makeHook([])} />);
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(<ContactsTile orgId={10} _useContacts={makeHook(undefined, true)} />);
    expect(
      screen.queryByText('No contacts yet. Add the account team.'),
    ).toBeNull();
  });
});

describe('ContactsTile — data view', () => {
  it('renders contact names when data is present', () => {
    render(
      <ContactsTile
        orgId={10}
        _useContacts={makeHook([baseContact])}
      />,
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('does not render empty state when contacts exist', () => {
    render(
      <ContactsTile
        orgId={10}
        _useContacts={makeHook([baseContact])}
      />,
    );
    expect(
      screen.queryByText('No contacts yet. Add the account team.'),
    ).toBeNull();
  });
});
