/**
 * OrgTimelineTile.test.tsx
 *
 * Covers: empty state, per-role rendering (user / assistant / agent_insight /
 * imported), date-group heading, and insight Accept/Dismiss action wiring.
 * Hook injection via _useNotes / _useConfirmInsight / _useRejectInsight props —
 * no real network calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { OrgTimelineTile } from './OrgTimelineTile';
import type { Note } from '../../../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW_ISO = new Date().toISOString();

/** Build a Note with sensible defaults; pass only what the test cares about. */
function makeNote(overrides: Partial<Note> & { id: number }): Note {
  return {
    organization_id: 10,
    content: 'Default test content',
    ai_response: null,
    source_path: null,
    file_mtime: null,
    role: 'user',
    thread_id: null,
    provenance: null,
    confirmed: true,
    created_at: NOW_ISO,
    ...overrides,
  };
}

function makeUseNotes(data: Note[] | undefined, isLoading = false) {
  return (_id: number, _opts?: { includeUnconfirmed?: boolean }) => ({
    data,
    isLoading,
  });
}

function makeInsightHook(mutate = vi.fn()) {
  const hook = () => ({ mutate });
  return { hook, mutate };
}

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('OrgTimelineTile — empty state', () => {
  it('shows the correct copy when no notes exist', () => {
    render(<OrgTimelineTile orgId={10} _useNotes={makeUseNotes([])} />);
    expect(
      screen.getByText(
        'No notes yet — start a conversation in the Chat tile or add one via Recent Notes.',
      ),
    ).toBeInTheDocument();
  });

  it('empty-state container has role="status"', () => {
    render(<OrgTimelineTile orgId={10} _useNotes={makeUseNotes([])} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(<OrgTimelineTile orgId={10} _useNotes={makeUseNotes(undefined, true)} />);
    expect(
      screen.queryByText(
        'No notes yet — start a conversation in the Chat tile or add one via Recent Notes.',
      ),
    ).toBeNull();
  });
});

// ─── Per-role rendering ───────────────────────────────────────────────────────

describe('OrgTimelineTile — user note', () => {
  it('renders "You" label and note content', () => {
    render(
      <OrgTimelineTile
        orgId={10}
        _useNotes={makeUseNotes([
          makeNote({ id: 1, role: 'user', content: 'Met with Alice.' }),
        ])}
      />,
    );
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Met with Alice.')).toBeInTheDocument();
  });
});

describe('OrgTimelineTile — assistant note', () => {
  it('renders "Agent" label and content in a pre element', () => {
    render(
      <OrgTimelineTile
        orgId={10}
        _useNotes={makeUseNotes([
          makeNote({ id: 2, role: 'assistant', content: 'Here is my analysis.' }),
        ])}
      />,
    );
    expect(screen.getByText('Agent')).toBeInTheDocument();
    // Content rendered inside a <pre> (monospace code-style block)
    const pre = screen.getByText('Here is my analysis.').closest('pre');
    expect(pre).toBeInTheDocument();
  });
});

describe('OrgTimelineTile — agent_insight note', () => {
  it('unconfirmed insight shows Insight chip and Accept/Dismiss buttons', () => {
    render(
      <OrgTimelineTile
        orgId={10}
        _useNotes={makeUseNotes([
          makeNote({ id: 3, role: 'agent_insight', confirmed: false, content: 'Cross-sell opportunity.' }),
        ])}
      />,
    );
    expect(screen.getByText('Insight')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept insight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss insight' })).toBeInTheDocument();
  });

  it('confirmed insight hides Accept and Dismiss buttons', () => {
    render(
      <OrgTimelineTile
        orgId={10}
        _useNotes={makeUseNotes([
          makeNote({ id: 4, role: 'agent_insight', confirmed: true, content: 'Already accepted.' }),
        ])}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Accept insight' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss insight' })).toBeNull();
  });
});

describe('OrgTimelineTile — imported note', () => {
  it('renders "From WorkVault" label and extracts the filename from source_path', () => {
    render(
      <OrgTimelineTile
        orgId={10}
        _useNotes={makeUseNotes([
          makeNote({
            id: 5,
            role: 'imported',
            content: 'Imported document content.',
            source_path: '/vault/Notes/quarterly-review.md',
          }),
        ])}
      />,
    );
    expect(screen.getByText('From WorkVault')).toBeInTheDocument();
    expect(screen.getByText('quarterly-review.md')).toBeInTheDocument();
  });
});

// ─── Date grouping ────────────────────────────────────────────────────────────

describe('OrgTimelineTile — date grouping', () => {
  it('notes with today\'s timestamp appear under a "Today" heading', () => {
    render(
      <OrgTimelineTile
        orgId={10}
        _useNotes={makeUseNotes([
          makeNote({ id: 6, role: 'user', created_at: new Date().toISOString() }),
        ])}
      />,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
  });
});

// ─── Insight action wiring ────────────────────────────────────────────────────

describe('OrgTimelineTile — insight actions', () => {
  it('Accept button calls confirmInsight with { id, orgId }', async () => {
    const user = userEvent.setup();
    const { hook: confirmHook, mutate: confirmMutate } = makeInsightHook();

    render(
      <OrgTimelineTile
        orgId={10}
        _useNotes={makeUseNotes([
          makeNote({ id: 7, role: 'agent_insight', confirmed: false }),
        ])}
        _useConfirmInsight={confirmHook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Accept insight' }));
    expect(confirmMutate).toHaveBeenCalledOnce();
    expect(confirmMutate).toHaveBeenCalledWith({ id: 7, orgId: 10 });
  });

  it('Dismiss button calls rejectInsight with { id, orgId }', async () => {
    const user = userEvent.setup();
    const { hook: rejectHook, mutate: rejectMutate } = makeInsightHook();

    render(
      <OrgTimelineTile
        orgId={10}
        _useNotes={makeUseNotes([
          makeNote({ id: 8, role: 'agent_insight', confirmed: false }),
        ])}
        _useRejectInsight={rejectHook}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss insight' }));
    expect(rejectMutate).toHaveBeenCalledOnce();
    expect(rejectMutate).toHaveBeenCalledWith({ id: 8, orgId: 10 });
  });
});
