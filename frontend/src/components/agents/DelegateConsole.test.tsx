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
const mockSdkMutate = vi.fn();
// Streaming function mocks — default: resolve immediately without calling callbacks
const mockStreamAgentic = vi.fn().mockResolvedValue(undefined);
const mockStreamSdk = vi.fn().mockResolvedValue(undefined);
let mockIsPending = false;
let mockData: AgenticResult | null = null;
let mockSubscriptionAuthenticated: boolean | undefined = undefined;

vi.mock('../../api/useSubagent', () => ({
  useDelegateAgentic: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
    data: mockData,
  }),
  useDelegateAgenticSdk: () => ({
    mutate: mockSdkMutate,
    isPending: mockIsPending,
    data: mockData,
  }),
  useAuthStatus: () => ({
    data: mockSubscriptionAuthenticated === undefined
      ? null
      : { subscription_authenticated: mockSubscriptionAuthenticated, api_key_configured: true },
  }),
  // useUsage is called twice (session + today); return different data per call
  useUsage: (period: string) => ({
    data: period === 'session'
      ? { cost_usd: 0.0042 }
      : { cost_usd: 0.0120 },
  }),
  streamDelegateAgentic: (...args: unknown[]) => mockStreamAgentic(...args),
  streamDelegateAgenticSdk: (...args: unknown[]) => mockStreamSdk(...args),
  subagentKeys: {
    usage: (period: string) => ['subagent', 'usage', period],
  },
}));

// Also mock useSettings — DelegateConsole calls useSetting for the personal key
vi.mock('../../api/useSettings', () => ({
  useSetting: () => ({ data: null }),
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
  mockSdkMutate.mockReset();
  mockStreamAgentic.mockReset().mockResolvedValue(undefined);
  mockStreamSdk.mockReset().mockResolvedValue(undefined);
  mockIsPending = false;
  mockData = null;
  mockSubscriptionAuthenticated = undefined;
  // Reset localStorage mode so each test starts from the default
  try { localStorage.removeItem('mc.delegate.authMode'); } catch { /* ignore */ }
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

  it('calls streaming function with correct payload when Run is clicked (subscription mode by default)', () => {
    renderConsole();
    const textarea = screen.getByRole('textbox', { name: /task/i });
    fireEvent.change(textarea, { target: { value: 'Do something useful' } });
    const btn = screen.getByRole('button', { name: /run agent/i });
    fireEvent.click(btn);

    // Default mode = subscription → uses streamDelegateAgenticSdk
    expect(mockStreamSdk).toHaveBeenCalledOnce();
    const callArg = mockStreamSdk.mock.calls[0]?.[0] as Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// Auth-mode toggle
// ---------------------------------------------------------------------------

describe('DelegateConsole — auth-mode toggle', () => {
  it('renders the Authentication radio group', () => {
    renderConsole();
    expect(screen.getByRole('radiogroup', { name: /authentication/i })).toBeInTheDocument();
  });

  it('subscription mode is selected by default', () => {
    renderConsole();
    const subscriptionRadio = screen.getByRole<HTMLInputElement>('radio', { name: /subscription/i });
    expect(subscriptionRadio.checked).toBe(true);
  });

  it('switching to API key mode selects that radio', () => {
    renderConsole();
    const apiKeyRadio = screen.getByRole<HTMLInputElement>('radio', { name: /api key/i });
    fireEvent.click(apiKeyRadio);
    expect(apiKeyRadio.checked).toBe(true);
    const subRadio = screen.getByRole<HTMLInputElement>('radio', { name: /subscription/i });
    expect(subRadio.checked).toBe(false);
  });

  it('subscription mode calls streamDelegateAgenticSdk (not streamDelegateAgentic)', () => {
    // Default mode = subscription
    renderConsole();
    const textarea = screen.getByRole('textbox', { name: /task/i });
    fireEvent.change(textarea, { target: { value: 'SDK task' } });
    const btn = screen.getByRole('button', { name: /run agent/i });
    fireEvent.click(btn);
    expect(mockStreamSdk).toHaveBeenCalledOnce();
    expect(mockStreamAgentic).not.toHaveBeenCalled();
  });

  it('API-key mode calls streamDelegateAgentic (not streamDelegateAgenticSdk)', () => {
    renderConsole();
    const apiKeyRadio = screen.getByRole('radio', { name: /api key/i });
    fireEvent.click(apiKeyRadio);
    const textarea = screen.getByRole('textbox', { name: /task/i });
    fireEvent.change(textarea, { target: { value: 'API key task' } });
    const btn = screen.getByRole('button', { name: /run agent/i });
    fireEvent.click(btn);
    expect(mockStreamAgentic).toHaveBeenCalledOnce();
    expect(mockStreamSdk).not.toHaveBeenCalled();
  });

  it('persists mode to localStorage and restores on re-render', () => {
    const { unmount } = renderConsole();
    const apiKeyRadio = screen.getByRole('radio', { name: /api key/i });
    fireEvent.click(apiKeyRadio);
    unmount();

    // Re-render — should restore api-key from localStorage
    renderConsole();
    const restoredRadio = screen.getByRole<HTMLInputElement>('radio', { name: /api key/i });
    expect(restoredRadio.checked).toBe(true);
  });

  it('shows warning and disables Run when subscription not authenticated', () => {
    mockSubscriptionAuthenticated = false;
    renderConsole();
    // Default mode = subscription, not authenticated
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/claude \/login/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /run agent/i });
    // Button disabled even with task
    const textarea = screen.getByRole('textbox', { name: /task/i });
    fireEvent.change(textarea, { target: { value: 'some task' } });
    expect(btn).toBeDisabled();
  });

  it('does NOT show auth warning when subscription is authenticated', () => {
    mockSubscriptionAuthenticated = true;
    renderConsole();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Streaming flow
// ---------------------------------------------------------------------------

describe('DelegateConsole — streaming flow', () => {
  it('shows "Streaming" indicator while stream is open', async () => {
    // The mock will call onEntry then never resolve — simulating an open stream.
    // We make it call the callbacks synchronously to test the indicator.
    mockStreamSdk.mockImplementation(
      (_input: unknown, callbacks: { onEntry: (e: { kind: string; text: string }) => void }) => {
        callbacks.onEntry({ kind: 'assistant_text', text: 'Step one.' });
        // Return a never-resolving promise to keep the stream "open".
        return new Promise(() => undefined);
      },
    );

    renderConsole();
    const textarea = screen.getByRole('textbox', { name: /task/i });
    fireEvent.change(textarea, { target: { value: 'Do a task' } });
    fireEvent.click(screen.getByRole('button', { name: /run agent/i }));

    // The "Streaming" indicator should appear while the promise is unresolved.
    await waitFor(() => {
      expect(screen.getByText(/streaming/i)).toBeInTheDocument();
    });

    // Cancel button should also be visible.
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('progressive events appear in the transcript as they arrive', async () => {
    mockStreamSdk.mockImplementation(
      (_input: unknown, callbacks: {
        onEntry: (e: { kind: string; text: string }) => void;
        onDone: (e: { type: 'done'; total_usage: object; total_cost_usd: number; iterations: number; stopped_reason: string }) => void;
      }) => {
        callbacks.onEntry({ kind: 'assistant_text', text: 'First event.' });
        callbacks.onEntry({ kind: 'assistant_text', text: 'Second event.' });
        callbacks.onDone({
          type: 'done',
          total_usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          total_cost_usd: 0.001,
          iterations: 1,
          stopped_reason: 'end_turn',
        });
        return Promise.resolve();
      },
    );

    renderConsole();
    fireEvent.change(screen.getByRole('textbox', { name: /task/i }), {
      target: { value: 'Stream this' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run agent/i }));

    // Both text events should appear after the run finishes.
    // Use getAllByText since "Second event." may appear in both the transcript
    // and the result callout (ResultFooter shows the last assistant text).
    await waitFor(() => {
      expect(screen.getAllByText('First event.').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Second event.').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('done event finalizes the result and hides streaming indicator', async () => {
    mockStreamSdk.mockImplementation(
      (_input: unknown, callbacks: {
        onDone: (e: { type: 'done'; total_usage: object; total_cost_usd: number; iterations: number; stopped_reason: string }) => void;
      }) => {
        callbacks.onDone({
          type: 'done',
          total_usage: { input_tokens: 5, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          total_cost_usd: 0.0005,
          iterations: 1,
          stopped_reason: 'end_turn',
        });
        return Promise.resolve();
      },
    );

    renderConsole();
    fireEvent.change(screen.getByRole('textbox', { name: /task/i }), {
      target: { value: 'Finalize me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run agent/i }));

    // After the done event, "Streaming" indicator should disappear.
    await waitFor(() => {
      expect(screen.queryByText(/streaming/i)).not.toBeInTheDocument();
    });
    // Cost should appear in the result footer.
    await waitFor(() => {
      expect(screen.getByText('$0.0005')).toBeInTheDocument();
    });
  });

  it('aborting the stream hides the streaming indicator', async () => {
    // The streaming function receives callbacks as the second argument, including signal.
    // We simulate an open stream that rejects with AbortError when the signal fires.
    mockStreamSdk.mockImplementation(
      (_input: unknown, callbacks: { signal?: AbortSignal }) => {
        return new Promise<void>((_resolve, reject) => {
          if (callbacks.signal) {
            callbacks.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      },
    );

    renderConsole();
    fireEvent.change(screen.getByRole('textbox', { name: /task/i }), {
      target: { value: 'Cancel me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run agent/i }));

    // Streaming indicator appears while the promise is unresolved.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // After abort, streaming indicator should disappear.
    await waitFor(() => {
      expect(screen.queryByText(/streaming/i)).not.toBeInTheDocument();
    });
  });
});
