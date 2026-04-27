/**
 * ChatTile.test.tsx
 *
 * Tests for ChatTile UX features:
 *   - Save as note button calls createNote mutation with correct payload
 *   - Copy button writes message content to the clipboard
 *   - Textarea onInput handler resizes the element
 *   - Auth-error state shows Settings link
 *   - Network-error state shows network message (no Settings link)
 *
 * Hook injection via _useStreamChat / _useCreateNote props — no real network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ChatTile } from './ChatTile';
import type { UseStreamChat } from '../../../api/useStreamChat';
import type { NoteCreate } from '../../../types';

// ---------------------------------------------------------------------------
// Stub factories
// ---------------------------------------------------------------------------

/** Build a minimal UseStreamChat stub. */
function makeStreamHook(
  messages: UseStreamChat['messages'] = [],
  failed: string | null = null,
): (_orgId: number, _threadId?: number) => UseStreamChat {
  return () => ({
    messages,
    stream: { streaming: false, partial: '', failed },
    send: vi.fn(),
    stop: vi.fn(),
    retry: vi.fn(),
  });
}

/** Build a minimal useCreateNote stub wrapping a controllable mutate spy.
 *  Only provides `mutate` — matches the narrow UseCreateNoteFn interface in ChatTile. */
function makeCreateNoteHook(mutateFn = vi.fn()) {
  return () => ({
    mutate: mutateFn as (
      vars: NoteCreate,
      opts?: { onSuccess?: (...args: unknown[]) => void },
    ) => void,
  });
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const assistantMsg: UseStreamChat['messages'][number] = {
  id: 1,
  role: 'assistant',
  content: 'Here is the answer.',
};

const userMsg: UseStreamChat['messages'][number] = {
  id: 2,
  role: 'user',
  content: 'What is the status?',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatTile — Save as note', () => {
  it('calls createNote mutate with correct payload when Save as note is clicked', () => {
    const mutateFn = vi.fn();

    render(
      <ChatTile
        orgId={10}
        orgName="Acme"
        _useStreamChat={makeStreamHook([assistantMsg])}
        _useCreateNote={makeCreateNoteHook(mutateFn)}
      />,
    );

    const saveBtn = screen.getByRole('button', { name: 'Save as note' });
    fireEvent.click(saveBtn);

    expect(mutateFn).toHaveBeenCalledOnce();
    expect(mutateFn).toHaveBeenCalledWith(
      {
        organization_id: 10,
        content: 'Here is the answer.',
        role: 'user',
        confirmed: true,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('Save as note button is only rendered for assistant messages, not user messages', () => {
    render(
      <ChatTile
        orgId={10}
        orgName="Acme"
        _useStreamChat={makeStreamHook([userMsg, assistantMsg])}
        _useCreateNote={makeCreateNoteHook()}
      />,
    );

    // There should be exactly one "Save as note" button (only for the assistant message)
    const saveBtns = screen.getAllByRole('button', { name: 'Save as note' });
    expect(saveBtns).toHaveLength(1);
  });
});

describe('ChatTile — Copy button', () => {
  let writeTextSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextSpy },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Copy button writes message content to navigator.clipboard.writeText', async () => {
    render(
      <ChatTile
        orgId={10}
        orgName="Acme"
        _useStreamChat={makeStreamHook([userMsg])}
        _useCreateNote={makeCreateNoteHook()}
      />,
    );

    const copyBtn = screen.getByRole('button', { name: 'Copy message' });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('What is the status?');
    });
  });

  it('both user and assistant messages have Copy buttons', () => {
    render(
      <ChatTile
        orgId={10}
        orgName="Acme"
        _useStreamChat={makeStreamHook([userMsg, assistantMsg])}
        _useCreateNote={makeCreateNoteHook()}
      />,
    );

    const copyBtns = screen.getAllByRole('button', { name: 'Copy message' });
    expect(copyBtns).toHaveLength(2);
  });
});

describe('ChatTile — textarea auto-resize', () => {
  it('onInput handler updates textarea style.height based on scrollHeight', () => {
    render(
      <ChatTile
        orgId={10}
        orgName="Acme"
        _useStreamChat={makeStreamHook([])}
        _useCreateNote={makeCreateNoteHook()}
      />,
    );

    const ta = screen.getByRole('textbox', { name: /message the acme agent/i });

    // Simulate a realistic scrollHeight so we can verify the resize logic
    Object.defineProperty(ta, 'scrollHeight', { value: 80, configurable: true });

    fireEvent.input(ta);

    // 80px < max (24 * 1.4 * 8 ≈ 268.8px) → height set to scrollHeight value
    expect(ta.style.height).toBe('80px');
    expect(ta.style.overflowY).toBe('hidden');
  });

  it('textarea height is capped at 8 rows when scrollHeight exceeds the limit', () => {
    render(
      <ChatTile
        orgId={10}
        orgName="Acme"
        _useStreamChat={makeStreamHook([])}
        _useCreateNote={makeCreateNoteHook()}
      />,
    );

    const ta = screen.getByRole('textbox', { name: /message the acme agent/i });

    // scrollHeight larger than 8 rows
    Object.defineProperty(ta, 'scrollHeight', { value: 999, configurable: true });

    fireEvent.input(ta);

    const maxH = 24 * 1.4 * 8; // ≈ 268.8
    expect(ta.style.height).toBe(`${maxH}px`);
    expect(ta.style.overflowY).toBe('auto');
  });
});

describe('ChatTile — error state classification', () => {
  it('shows Settings link when stream.failed contains "API key not configured"', () => {
    render(
      <ChatTile
        orgId={10}
        orgName="Acme"
        _useStreamChat={makeStreamHook([], 'API key not configured')}
        _useCreateNote={makeCreateNoteHook()}
      />,
    );

    expect(screen.getByRole('link', { name: /go to settings/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows network error copy (no Settings link) when stream.failed contains "Failed to fetch"', () => {
    render(
      <ChatTile
        orgId={10}
        orgName="Acme"
        _useStreamChat={makeStreamHook([], 'Failed to fetch')}
        _useCreateNote={makeCreateNoteHook()}
      />,
    );

    expect(
      screen.getByText(/network error — check your connection/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).toBeNull();
  });

  it('shows Anthropic upstream error text for non-auth non-network failures', () => {
    render(
      <ChatTile
        orgId={10}
        orgName="Acme"
        _useStreamChat={makeStreamHook([], 'overloaded_error')}
        _useCreateNote={makeCreateNoteHook()}
      />,
    );

    expect(
      screen.getByText(/anthropic returned an error: overloaded_error/i),
    ).toBeInTheDocument();
  });
});
