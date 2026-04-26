/**
 * OemQuickLinksTile.test.tsx
 *
 * Tests for the OemQuickLinksTile empty-state and data-view rendering.
 * Hook injection via the _useDocuments prop — no real network calls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OemQuickLinksTile } from './OemQuickLinksTile';
import type { Document } from '../../../types';

const linkDoc: Document = {
  id: 1,
  organization_id: 20,
  kind: 'link',
  label: 'Cisco Partner Portal',
  url_or_path: 'https://partners.cisco.com',
  source: 'manual',
  created_at: '2026-01-01T00:00:00Z',
};

const fileDoc: Document = {
  id: 2,
  organization_id: 20,
  kind: 'file',
  label: 'Datasheet.pdf',
  url_or_path: 'C:\\Documents\\Datasheet.pdf',
  source: 'manual',
  created_at: '2026-01-01T00:00:00Z',
};

function makeHook(data: Document[] | undefined, isLoading = false) {
  return (_orgId: number) => ({ data, isLoading });
}

describe('OemQuickLinksTile — empty state', () => {
  it('shows empty-state copy when links array is empty', () => {
    render(<OemQuickLinksTile orgId={20} _useDocuments={makeHook([])} />);
    expect(
      screen.getByText('No links yet — add a link to start tracking.'),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(<OemQuickLinksTile orgId={20} _useDocuments={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state when documents list has only file-kind entries', () => {
    render(
      <OemQuickLinksTile orgId={20} _useDocuments={makeHook([fileDoc])} />,
    );
    expect(
      screen.getByText('No links yet — add a link to start tracking.'),
    ).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(
      <OemQuickLinksTile orgId={20} _useDocuments={makeHook(undefined, true)} />,
    );
    expect(
      screen.queryByText('No links yet — add a link to start tracking.'),
    ).toBeNull();
  });
});

describe('OemQuickLinksTile — data view', () => {
  it('renders link label when data is present', () => {
    render(
      <OemQuickLinksTile orgId={20} _useDocuments={makeHook([linkDoc])} />,
    );
    expect(screen.getByText('Cisco Partner Portal')).toBeInTheDocument();
  });

  it('does not render empty state when links exist', () => {
    render(
      <OemQuickLinksTile orgId={20} _useDocuments={makeHook([linkDoc])} />,
    );
    expect(
      screen.queryByText('No links yet — add a link to start tracking.'),
    ).toBeNull();
  });

  it('only renders link-kind documents, not file-kind', () => {
    render(
      <OemQuickLinksTile
        orgId={20}
        _useDocuments={makeHook([linkDoc, fileDoc])}
      />,
    );
    expect(screen.getByText('Cisco Partner Portal')).toBeInTheDocument();
    expect(screen.queryByText('Datasheet.pdf')).toBeNull();
  });
});
