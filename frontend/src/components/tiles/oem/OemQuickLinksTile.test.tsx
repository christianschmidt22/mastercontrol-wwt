/**
 * OemQuickLinksTile.test.tsx
 *
 * Tests for the OemQuickLinksTile empty-state, data-view rendering, and
 * inline add-link form. Hook injection via _useDocuments / _useCreateDocument
 * props — no real network calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// ── Inline add form ───────────────────────────────────────────────────────────

describe('OemQuickLinksTile — inline add form', () => {
  it('clicking Add link opens the form; Cancel collapses it and clears fields', async () => {
    const user = userEvent.setup();
    render(<OemQuickLinksTile orgId={20} _useDocuments={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add link' }));

    expect(screen.getByLabelText('Label')).toBeInTheDocument();
    expect(screen.getByLabelText('URL')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Label')).toBeNull();
  });

  it('shows validation error in aria-live region when label is empty on submit', async () => {
    const user = userEvent.setup();
    render(<OemQuickLinksTile orgId={20} _useDocuments={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.type(screen.getByLabelText('URL'), 'https://partners.cisco.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Label is required.')).toBeInTheDocument();
  });

  it('save calls mutate with the expected payload', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    const hook = () => ({ mutate, isPending: false });
    render(
      <OemQuickLinksTile
        orgId={20}
        _useDocuments={makeHook([])}
        _useCreateDocument={hook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.type(screen.getByLabelText('Label'), 'NetApp Support');
    await user.type(screen.getByLabelText('URL'), 'https://support.netapp.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 20,
        kind: 'link',
        label: 'NetApp Support',
        url_or_path: 'https://support.netapp.com',
      }),
      expect.any(Object),
    );
  });

  it('optimistically inserts new link into the list before server responds', async () => {
    const user = userEvent.setup();
    render(
      <OemQuickLinksTile
        orgId={20}
        _useDocuments={makeHook([linkDoc])}
      />,
    );

    expect(screen.getByText('Cisco Partner Portal')).toBeInTheDocument();
    expect(screen.queryByText('NetApp Support')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.type(screen.getByLabelText('Label'), 'NetApp Support');
    await user.type(screen.getByLabelText('URL'), 'https://support.netapp.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // New link appears immediately
    expect(screen.getByText('NetApp Support')).toBeInTheDocument();
    // Existing link is still present
    expect(screen.getByText('Cisco Partner Portal')).toBeInTheDocument();
  });
});
