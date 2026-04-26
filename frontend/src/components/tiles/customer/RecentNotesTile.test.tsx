/**
 * RecentNotesTile.test.tsx
 *
 * Tests for the RecentNotesTile empty-state and data-view rendering.
 * Hook injection via the _useNotes prop — no real network calls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { RecentNotesTile } from './RecentNotesTile';
import type { Note } from '../../../types';

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

describe('RecentNotesTile — empty state', () => {
  it('shows empty-state copy when notes array is empty', () => {
    render(<RecentNotesTile orgId={10} _useNotes={makeHook([])} />);
    expect(
      screen.getByText(
        'Take your first note. The agent will see anything you save here.',
      ),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(<RecentNotesTile orgId={10} _useNotes={makeHook([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows Add note button in empty state', () => {
    render(<RecentNotesTile orgId={10} _useNotes={makeHook([])} />);
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(<RecentNotesTile orgId={10} _useNotes={makeHook(undefined, true)} />);
    expect(
      screen.queryByText(
        'Take your first note. The agent will see anything you save here.',
      ),
    ).toBeNull();
  });
});

describe('RecentNotesTile — data view', () => {
  it('renders note content when data is present', () => {
    render(<RecentNotesTile orgId={10} _useNotes={makeHook([userNote])} />);
    expect(
      screen.getByText('Met with Alice to discuss renewal timeline.'),
    ).toBeInTheDocument();
  });

  it('does not render empty state when notes exist', () => {
    render(<RecentNotesTile orgId={10} _useNotes={makeHook([userNote])} />);
    expect(
      screen.queryByText(
        'Take your first note. The agent will see anything you save here.',
      ),
    ).toBeNull();
  });
});
