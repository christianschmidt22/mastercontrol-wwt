/**
 * OemPageHeader.test.tsx
 *
 * Header behavior:
 *   1. Renders the org name in an h1
 *   2. Renders the 'oem' type status pill
 *   3. Shows "Click to add summary" when metadata.summary is absent
 *   4. Shows summary text when metadata.summary is present
 *   5. Empty summary CTA calls onEditOrg handler
 *   6. formatLastContact — relative time formatting
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  OemPageHeader,
  formatLastContact,
  type OemPageHeaderProps,
} from './OemPageHeader';
import type { Organization } from '../../types';

const baseOrg: Organization = {
  id: 7,
  type: 'oem',
  name: 'Cisco',
  metadata: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderHeader(overrides: Partial<OemPageHeaderProps> = {}) {
  return render(<OemPageHeader org={baseOrg} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('OemPageHeader — rendering', () => {
  it('renders the org name in an h1', () => {
    renderHeader();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cisco');
  });

  it('renders the oem type status pill', () => {
    renderHeader();
    // Status pill renders "oem" as uppercase text
    const pill = screen.getByText('oem');
    expect(pill).toBeInTheDocument();
  });

  it('shows empty-state summary button when metadata.summary is absent', () => {
    renderHeader({ org: { ...baseOrg, metadata: null } });
    expect(screen.getByText('Click to add summary')).toBeInTheDocument();
  });

  it('shows summary text when metadata.summary is present', () => {
    renderHeader({
      org: {
        ...baseOrg,
        metadata: { summary: 'Networking hardware and solutions vendor.' },
      },
    });
    expect(screen.getByText('Networking hardware and solutions vendor.')).toBeInTheDocument();
    expect(screen.queryByText('Click to add summary')).toBeNull();
  });

  it('renders partner_status pill when present in metadata', () => {
    renderHeader({
      org: { ...baseOrg, metadata: { partner_status: 'strategic' } },
    });
    expect(screen.getByText('strategic')).toBeInTheDocument();
  });

  it('calls onEditOrg when the empty summary CTA is clicked', () => {
    const onEditOrg = vi.fn();
    renderHeader({ onEditOrg });
    fireEvent.click(screen.getByRole('button', { name: /click to add summary/i }));
    expect(onEditOrg).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// formatLastContact
// ---------------------------------------------------------------------------

describe('formatLastContact', () => {
  it('returns "just now" for a timestamp within the last minute', () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    expect(formatLastContact(recent)).toBe('just now');
  });

  it('returns "just now" for future-dated timestamps (clock skew)', () => {
    const future = new Date(Date.now() + 5_000).toISOString();
    expect(formatLastContact(future)).toBe('just now');
  });

  it('returns "X min ago" for timestamps a few minutes old', () => {
    const fiveMin = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatLastContact(fiveMin)).toBe('5 min ago');
  });

  it('returns "X days ago" for timestamps multiple days old', () => {
    const twoDays = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatLastContact(twoDays)).toBe('2 days ago');
  });

  it('returns "1 day ago" (singular) for exactly one day', () => {
    const oneDay = new Date(Date.now() - 1 * 24 * 60 * 60_000 - 60_000).toISOString();
    expect(formatLastContact(oneDay)).toBe('1 day ago');
  });

  it('returns "Never contacted" for null', () => {
    expect(formatLastContact(null)).toBe('Never contacted');
  });

  it('returns "Never contacted" for undefined', () => {
    expect(formatLastContact(undefined)).toBe('Never contacted');
  });
});
