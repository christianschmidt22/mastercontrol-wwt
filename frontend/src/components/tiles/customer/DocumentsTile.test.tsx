/**
 * DocumentsTile.test.tsx
 *
 * Tests for the DocumentsTile empty-state and data-view rendering.
 * Hook injection via the _useDocuments prop — no real network calls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DocumentsTile } from './DocumentsTile';
import type { Document } from '../../../types';

const linkDoc: Document = {
  id: 1,
  organization_id: 10,
  kind: 'link',
  label: 'Fairview SharePoint',
  url_or_path: 'https://sharepoint.example.com/fairview',
  source: 'manual',
  created_at: '2026-01-01T00:00:00Z',
};

function makeHook(data: Document[] | undefined, isLoading = false) {
  return (_orgId: number) => ({ data, isLoading });
}

describe('DocumentsTile — empty state', () => {
  it('shows empty-state copy when documents array is empty', () => {
    render(<DocumentsTile orgId={10} _useDocuments={makeHook([])} />);
    expect(
      screen.getByText('No documents yet — add a link to start tracking.'),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(<DocumentsTile orgId={10} _useDocuments={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(
      <DocumentsTile orgId={10} _useDocuments={makeHook(undefined, true)} />,
    );
    expect(
      screen.queryByText('No documents yet — add a link to start tracking.'),
    ).toBeNull();
  });
});

describe('DocumentsTile — data view', () => {
  it('renders document label when data is present', () => {
    render(
      <DocumentsTile orgId={10} _useDocuments={makeHook([linkDoc])} />,
    );
    expect(screen.getByText('Fairview SharePoint')).toBeInTheDocument();
  });

  it('does not render empty state when documents exist', () => {
    render(
      <DocumentsTile orgId={10} _useDocuments={makeHook([linkDoc])} />,
    );
    expect(
      screen.queryByText('No documents yet — add a link to start tracking.'),
    ).toBeNull();
  });
});
