/**
 * RecentNotesTile.test.tsx
 *
 * Tests for the RecentNotesTile empty-state, data-view rendering, and
 * inline add-note form. Hook injection via _useNotes / _useCreateNote
 * props — no real network calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecentNotesTile } from './RecentNotesTile';
import type { Note, NoteCreate } from '../../../types';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const userNote: Note = {
  id: 1,
  organization_id: 10,
  content: 'Met with Alice to discuss renewal timeline.',
  ai_response: null,
  source_path: null,
  file_mtime: null,
  role: 'user',
  thread_id: null,
  provenance: null,
  confirmed: true,
  created_at: '2026-01-15T10:30:00Z',
};

function makeHook(data: Note[] | undefined, isLoading = false) {
  return (_orgId: number, _opts?: { includeUnconfirmed?: boolean }) => ({
    data,
    isLoading,
  });
}

function makeMutationHook(mutate = vi.fn()) {
  return { hook: () => ({ mutate, isPending: false }), mutate };
}

describe('RecentNotesTile — empty state', () => {
  it('shows empty-state copy when notes array is empty', () => {
    renderWithClient(<RecentNotesTile orgId={10} _useNotes={makeHook([])} />);
    expect(
      screen.getByText(
        'Take your first note. The agent will see anything you save here.',
      ),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    renderWithClient(<RecentNotesTile orgId={10} _useNotes={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows Add note button in empty state', () => {
    renderWithClient(<RecentNotesTile orgId={10} _useNotes={makeHook([])} />);
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    renderWithClient(<RecentNotesTile orgId={10} _useNotes={makeHook(undefined, true)} />);
    expect(
      screen.queryByText(
        'Take your first note. The agent will see anything you save here.',
      ),
    ).toBeNull();
  });
});

describe('RecentNotesTile — data view', () => {
  it('renders note content when data is present', () => {
    renderWithClient(<RecentNotesTile orgId={10} _useNotes={makeHook([userNote])} />);
    expect(
      screen.getByText('Met with Alice to discuss renewal timeline.'),
    ).toBeInTheDocument();
  });

  it('does not render empty state when notes exist', () => {
    renderWithClient(<RecentNotesTile orgId={10} _useNotes={makeHook([userNote])} />);
    expect(
      screen.queryByText(
        'Take your first note. The agent will see anything you save here.',
      ),
    ).toBeNull();
  });
});

describe('RecentNotesTile — inline add form', () => {
  it('clicking Add note button (title) shows textarea; Cancel hides it', async () => {
    const user = userEvent.setup();
    // Title button only appears when list is non-empty
    renderWithClient(<RecentNotesTile orgId={10} _useNotes={makeHook([userNote])} />);

    const addBtn = screen.getByRole('button', { name: 'Add note' });
    await user.click(addBtn);

    // Textarea is now visible
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Cancel collapses the form
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('save calls mutate with role "user" and correct content', async () => {
    const user = userEvent.setup();
    const { hook, mutate } = makeMutationHook();
    renderWithClient(
      <RecentNotesTile
        orgId={10}
        _useNotes={makeHook([userNote])}
        _useCreateNote={hook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await user.type(screen.getByRole('textbox'), 'Called Alice re renewal.');
    await user.click(screen.getByRole('button', { name: 'Save Note' }));

    expect(mutate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining<Partial<NoteCreate>>({
        organization_id: 10,
        content: 'Called Alice re renewal.',
        role: 'user',
      }),
    );
  });

  it('Save Note button is disabled while textarea is empty', async () => {
    const user = userEvent.setup();
    renderWithClient(<RecentNotesTile orgId={10} _useNotes={makeHook([userNote])} />);

    await user.click(screen.getByRole('button', { name: 'Add note' }));

    // Textarea is empty — Save Note should be disabled
    expect(screen.getByRole('button', { name: 'Save Note' })).toBeDisabled();
  });

  it('empty-state Add note button also opens the form', async () => {
    const user = userEvent.setup();
    // Render with empty list — the empty-state button is shown
    renderWithClient(<RecentNotesTile orgId={10} _useNotes={makeHook([])} />);

    await user.click(screen.getByRole('button', { name: 'Add note' }));

    // Form appears; empty state is replaced by the form
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Take your first note. The agent will see anything you save here.',
      ),
    ).toBeNull();
  });
});
