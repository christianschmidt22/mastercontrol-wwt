/**
 * AccountChannelTile.test.tsx
 *
 * Tests for the OEM AccountChannelTile empty-state and data-view rendering.
 * Hook injection via the _useContacts prop — no real network calls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AccountChannelTile } from './AccountChannelTile';
import type { Contact } from '../../../types';

const accountContact: Contact = {
  id: 1,
  organization_id: 20,
  name: 'Bob Chen',
  title: 'Account Manager',
  email: 'bob@cisco.com',
  phone: null,
  role: 'account',
  created_at: '2026-01-01T00:00:00Z',
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
};

function makeHook(data: Contact[] | undefined, isLoading = false) {
  return (_orgId: number) => ({ data, isLoading });
}

describe('AccountChannelTile — empty state', () => {
  it('shows empty-state copy when contacts array is empty', () => {
    render(<AccountChannelTile orgId={20} _useContacts={makeHook([])} />);
    expect(
      screen.getByText('No contacts yet. Add the account team.'),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(<AccountChannelTile orgId={20} _useContacts={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows Add contact button in empty state', () => {
    render(<AccountChannelTile orgId={20} _useContacts={makeHook([])} />);
    expect(
      screen.getByRole('button', { name: 'Add contact' }),
    ).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(
      <AccountChannelTile orgId={20} _useContacts={makeHook(undefined, true)} />,
    );
    expect(
      screen.queryByText('No contacts yet. Add the account team.'),
    ).toBeNull();
  });
});

describe('AccountChannelTile — data view', () => {
  it('renders account team contact', () => {
    render(
      <AccountChannelTile
        orgId={20}
        _useContacts={makeHook([accountContact])}
      />,
    );
    expect(screen.getByText('Bob Chen')).toBeInTheDocument();
  });

  it('renders channel team contact in its own section', () => {
    render(
      <AccountChannelTile
        orgId={20}
        _useContacts={makeHook([channelContact])}
      />,
    );
    expect(screen.getByText('Carol Wu')).toBeInTheDocument();
    expect(screen.getByText('Channel Team')).toBeInTheDocument();
  });

  it('does not render empty state when contacts exist', () => {
    render(
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
