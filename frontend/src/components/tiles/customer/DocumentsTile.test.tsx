/**
 * DocumentsTile.test.tsx
 *
 * Tests for the DocumentsTile empty-state, data-view rendering, and
 * inline add-document form. Hook injection via _useDocuments /
 * _useCreateDocument props — no real network calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DocumentsTile } from './DocumentsTile';
import type { Document, DocumentCreate } from '../../../types';

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

function makeMutationHook(mutate = vi.fn()) {
  return { hook: () => ({ mutate, isPending: false }), mutate };
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

describe('DocumentsTile — inline add form', () => {
  it('clicking Add document button shows form; Cancel hides it', async () => {
    const user = userEvent.setup();
    render(<DocumentsTile orgId={10} _useDocuments={makeHook([])} />);

    // Button is visible initially
    const addBtn = screen.getByRole('button', { name: 'Add document' });
    await user.click(addBtn);

    // Form inputs are now visible
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
    expect(screen.getByLabelText('URL or path')).toBeInTheDocument();

    // Cancel collapses the form
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Label')).toBeNull();
  });

  it('save calls mutate with the expected payload', async () => {
    const user = userEvent.setup();
    const { hook, mutate } = makeMutationHook();
    render(
      <DocumentsTile
        orgId={10}
        _useDocuments={makeHook([])}
        _useCreateDocument={hook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add document' }));
    await user.type(screen.getByLabelText('Label'), 'My Report');
    await user.type(screen.getByLabelText('URL or path'), 'https://docs.example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining<Partial<DocumentCreate>>({
        organization_id: 10,
        label: 'My Report',
        url_or_path: 'https://docs.example.com',
        kind: 'link',
      }),
    );
  });

  it('cancel does not call mutate', async () => {
    const user = userEvent.setup();
    const { hook, mutate } = makeMutationHook();
    render(
      <DocumentsTile
        orgId={10}
        _useDocuments={makeHook([])}
        _useCreateDocument={hook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add document' }));
    await user.type(screen.getByLabelText('Label'), 'Draft');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows validation error when label is empty on submit', async () => {
    const user = userEvent.setup();
    render(<DocumentsTile orgId={10} _useDocuments={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add document' }));
    await user.type(screen.getByLabelText('URL or path'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Label is required.')).toBeInTheDocument();
  });
});
