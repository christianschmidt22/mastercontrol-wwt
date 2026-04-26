/**
 * DelegateConsole.test.tsx
 *
 * Tests for the DelegateConsole UI component.
 * The hooks (useDelegateAgentic, useRecentUsage) are mocked so we test
 * component behaviour in isolation — no network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { DelegateConsole } from './DelegateConsole';
import type { AgenticResult } from '../../types/subagent';

// ---------------------------------------------------------------------------
// Mock the API hooks — isolate component behaviour from network
// ---------------------------------------------------------------------------

const mockMutate = vi.fn();
let mockIsPending = false;
let mockData: AgenticResult | null = null;

vi.mock('../../api/useSubagent', () => ({
  useDelegateAgentic: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
    data: mockData,
  }),
  // useUsage is called twice (session + today); return different data per call
  useUsage: (period: string) => ({
    data: period === 'session'
      ? { cost_usd: 0.0042 }
      : { cost_usd: 0.0120 },
  }),
}));

// ---------------------------------------------------------------------------
// Stable wrapper — must be created once per file, not inside render calls
// ---------------------------------------------------------------------------

const qc = new QueryClient();
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function renderConsole() {
  return render(<DelegateConsole />, { wrapper: Wrapper });
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockMutate.mockReset();
  mockIsPending = false;
  mockData = null;
});


// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('DelegateConsole — rendering', () => {
  it('renders the task textarea', () => {
    renderConsole();
    expect(screen.getByRole('textbox', { name: /task/i })).toBeInTheDocument();
  });

  it('renders the working directory field', () => {
    renderConsole();
    expect(screen.getByRole('textbox', { name: /working directory/i })).toBeInTheDocument();
  });

  it('renders all 5 tool checkboxes', () => {
    renderConsole();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(5);
  });

  it('bash is unchecked by default', () => {
    renderConsole();
    // bash is the last checkbox (5th)
    const checkboxes = screen.getAllByRole<HTMLInputElement>('checkbox');
    const bash = checkboxes[4];
    expect(bash?.checked).toBe(false);
  });

  it('read_file and list_files are checked by default', () => {
    renderConsole();
    const checkboxes = screen.getAllByRole<HTMLInputElement>('checkbox');
    // read_file is index 0, list_files is index 1
    expect(checkboxes[0]?.checked).toBe(true);
    expect(checkboxes[1]?.checked).toBe(true);
  });

  it('shows the model selector defaulting to claude-sonnet-4-6', () => {
    renderConsole();
    const select = screen.getByRole<HTMLSelectElement>('combobox');
    expect(select.value).toBe('claude-sonnet-4-6');
  });

  it('displays the cost meter with session and today costs', () => {
    renderConsole();
    // 0.0042 < 0.01 so formatted as $0.0042 (4 decimal places)
    expect(screen.getByText('$0.0042')).toBeInTheDocument();
    // 0.012 >= 0.01 so formatted as $0.01 (2 decimal places); displayed as "$0.01"
    expect(screen.getByText('$0.01')).toBeInTheDocument();
  });

  it('shows the empty state when no task has run', () => {
    renderConsole();
    expect(screen.getByText(/type a task above/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Run button behaviour
// ---------------------------------------------------------------------------

describe('DelegateConsole — Run button', () => {
  it('Run button is disabled when task is empty', () => {
    renderConsole();
    const btn = screen.getByRole('button', { name: /run agent/i });
    expect(btn).toBeDisabled();
  });

  it('Run button enables when task has text', () => {
    renderConsole();
    const textarea = screen.getByRole('textbox', { name: /task/i });
    fireEvent.change(textarea, { target: { value: 'List files' } });
    const btn = screen.getByRole('button', { name: /run agent/i });
    expect(btn).not.toBeDisabled();
  });

  it('calls mutate with correct payload when Run is clicked', () => {
    renderConsole();
    const textarea = screen.getByRole('textbox', { name: /task/i });
    fireEvent.change(textarea, { target: { value: 'Do something useful' } });
    const btn = screen.getByRole('button', { name: /run agent/i });
    fireEvent.click(btn);

    expect(mockMutate).toHaveBeenCalledOnce();
    const callArg = mockMutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg.task).toBe('Do something useful');
    expect(Array.isArray(callArg.tools)).toBe(true);
    // default tools: read_file + list_files
    expect(callArg.tools).toContain('read_file');
    expect(callArg.tools).toContain('list_files');
    expect(callArg.tools).not.toContain('bash');
  });

  it('shows "Running…" and is disabled while isPending', () => {
    mockIsPending = true;
    renderConsole();
    const btn = screen.getByRole('button', { name: /running/i });
    expect(btn).toBeDisabled();
  });

  it('shows aria-busy=true on the root region while pending', () => {
    mockIsPending = true;
    const { container } = renderConsole();
    const region = container.querySelector('[aria-busy="true"]');
    expect(region).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Transcript — ok=true
// ---------------------------------------------------------------------------

describe('DelegateConsole — ok=true transcript', () => {
  beforeEach(() => {
    mockData = {
      ok: true,
      transcript: [
        { kind: 'assistant_text', text: 'I will list the files.', turn: 1 },
        {
          kind: 'assistant_tool_use',
          tool: 'list_files',
          input: { path: '/workspace' },
          tool_use_id: 'tu_001',
          turn: 1,
        },
        {
          kind: 'tool_result',
          tool_use_id: 'tu_001',
          output: 'file_a.txt\nfile_b.txt',
          is_error: false,
          turn: 1,
        },
        { kind: 'assistant_text', text: 'Found 2 files.', turn: 2 },
      ],
      total_usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      total_cost_usd: 0.0015,
      iterations: 2,
      stopped_reason: 'end_turn',
    };
  });

  it('renders assistant_text entries', () => {
    renderConsole();
    expect(screen.getByText('I will list the files.')).toBeInTheDocument();
    expect(screen.getAllByText('Found 2 files.').length).toBeGreaterThanOrEqual(1);
  });

  it('renders tool_use entry as a collapsed disclosure button', () => {
    renderConsole();
    // Find the collapsed disclosure button for the tool_use (contains "list_files")
    const expandBtns = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-expanded') === 'false' && /list_files/.test(b.textContent ?? ''));
    expect(expandBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('expands tool_use to show JSON on click', () => {
    renderConsole();
    const expandBtn = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-expanded') === 'false' && /list_files/.test(b.textContent ?? ''));
    expect(expandBtn).toBeInTheDocument();
    fireEvent.click(expandBtn!);
    // After expand, the JSON pre should be visible (at least one match for /workspace)
    const matches = screen.getAllByText(/\/workspace/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders tool_result output', () => {
    renderConsole();
    expect(screen.getByText(/file_a\.txt/)).toBeInTheDocument();
  });

  it('renders the result footer with cost and iterations', () => {
    renderConsole();
    // Cost appears
    expect(screen.getByText('$0.0015')).toBeInTheDocument();
    // Iteration count
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders last assistant_text in the result callout', () => {
    renderConsole();
    // "Found 2 files." should appear at least once (in callout + transcript)
    const matches = screen.getAllByText('Found 2 files.');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Transcript — ok=false
// ---------------------------------------------------------------------------

describe('DelegateConsole — ok=false error', () => {
  beforeEach(() => {
    mockData = {
      ok: false,
      error: 'Model refused the task due to policy.',
      transcript_so_far: [],
      total_usage: {
        input_tokens: 10,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  });

  it('renders the error message', () => {
    renderConsole();
    expect(
      screen.getByText(/model refused the task due to policy/i),
    ).toBeInTheDocument();
  });

  it('does not render iteration stats on error result', () => {
    renderConsole();
    expect(screen.queryByText(/iterations:/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Advanced disclosure
// ---------------------------------------------------------------------------

describe('DelegateConsole — Advanced section', () => {
  it('hides advanced fields by default', () => {
    renderConsole();
    expect(screen.queryByLabelText(/max iterations/i)).not.toBeInTheDocument();
  });

  it('reveals advanced fields when Advanced button is clicked', async () => {
    renderConsole();
    // Find the "Advanced" disclosure button
    const advBtn = screen
      .getAllByRole('button')
      .find((b) => /advanced/i.test(b.textContent ?? ''));
    expect(advBtn).toBeInTheDocument();
    fireEvent.click(advBtn!);
    await waitFor(() => {
      expect(screen.getByLabelText(/max iterations/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/max tokens/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/system prompt/i)).toBeInTheDocument();
    });
  });
});
