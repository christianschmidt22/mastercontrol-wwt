/**
 * TemplatesTab.test.tsx
 *
 * Tests for the Templates tab:
 *  - Renders both customer and OEM sections
 *  - Save button is disabled when no changes made
 *  - Mutating the textarea enables the Save button
 *  - Save button calls the mutation
 *  - Tool checkbox toggles update state
 *  - Loading and error states
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { TemplatesTab } from './TemplatesTab';
import * as useAgentConfigsMod from '../../api/useAgentConfigs';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpdateMutateAsync = vi.fn().mockResolvedValue({});

const DEFAULT_CONFIGS = [
  {
    id: 1,
    section: 'customer' as const,
    organization_id: null,
    system_prompt_template: 'You are a customer agent for {{org_name}}.',
    tools_enabled: { web_search: true, record_insight: true },
    model: 'claude-sonnet-4-6',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    section: 'oem' as const,
    organization_id: null,
    system_prompt_template: 'You are an OEM agent for {{org_name}}.',
    tools_enabled: { web_search: false, record_insight: true },
    model: 'claude-sonnet-4-6',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

vi.mock('../../api/useAgentConfigs', () => ({
  useAgentConfigs: vi.fn(() => ({
    data: DEFAULT_CONFIGS,
    isLoading: false,
    isError: false,
  })),
  useUpdateAgentConfig: vi.fn(() => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function renderTab() {
  return render(<TemplatesTab />, { wrapper: makeWrapper() });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMutateAsync.mockResolvedValue({});
  // Restore mock to default behaviour
  vi.mocked(useAgentConfigsMod.useAgentConfigs).mockReturnValue({
    data: DEFAULT_CONFIGS,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useAgentConfigsMod.useAgentConfigs>);
  vi.mocked(useAgentConfigsMod.useUpdateAgentConfig).mockReturnValue({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useAgentConfigsMod.useUpdateAgentConfig>);
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('TemplatesTab — rendering', () => {
  it('renders both customer and OEM sections', () => {
    renderTab();
    expect(screen.getByText('Customer agent')).toBeDefined();
    expect(screen.getByText('OEM agent')).toBeDefined();
  });

  it('renders two labeled textareas (one per section)', () => {
    renderTab();
    const textareas = screen.getAllByRole('textbox');
    expect(textareas.length).toBeGreaterThanOrEqual(2);
  });

  it('renders tool checkboxes', () => {
    renderTab();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Save button state
// ---------------------------------------------------------------------------

describe('TemplatesTab — save button', () => {
  it('save button is disabled when no changes have been made', () => {
    renderTab();
    const saveButtons = screen.getAllByRole('button', { name: /save template/i });
    saveButtons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('save button enables after editing the system prompt', async () => {
    renderTab();
    const textareas = screen.getAllByRole('textbox');
    const firstTextarea = textareas[0]!;
    await userEvent.type(firstTextarea, ' extra text');
    const saveButtons = screen.getAllByRole('button', { name: /save template/i });
    const firstSave = saveButtons[0]! as HTMLButtonElement;
    await waitFor(() => {
      expect(firstSave.disabled).toBe(false);
    });
  });

  it('clicking Save calls the mutation with config id', async () => {
    renderTab();
    const textareas = screen.getAllByRole('textbox');
    const firstTextarea = textareas[0]!;
    await userEvent.type(firstTextarea, ' modified');

    const saveButtons = screen.getAllByRole('button', { name: /save template/i });
    await userEvent.click(saveButtons[0]!);

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
    });
    const callArg = mockUpdateMutateAsync.mock.calls[0]?.[0] as { id: number } | undefined;
    expect(callArg?.id).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tool toggles
// ---------------------------------------------------------------------------

describe('TemplatesTab — tool toggles', () => {
  it('marks web_search checkbox as checked when tools_enabled has web_search: true', () => {
    renderTab();
    const webSearchBoxes = screen.getAllByRole('checkbox', { name: /web_search/i });
    const firstBox = webSearchBoxes[0]! as HTMLInputElement;
    expect(firstBox.checked).toBe(true);
  });

  it('unchecking a tool checkbox marks the form dirty (enables save)', async () => {
    renderTab();
    const webSearchBoxes = screen.getAllByRole('checkbox', { name: /web_search/i });
    await userEvent.click(webSearchBoxes[0]!);
    const saveButtons = screen.getAllByRole('button', { name: /save template/i });
    const firstSave = saveButtons[0]! as HTMLButtonElement;
    await waitFor(() => {
      expect(firstSave.disabled).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Loading / error states
// ---------------------------------------------------------------------------

describe('TemplatesTab — loading and error states', () => {
  it('shows loading state', () => {
    vi.mocked(useAgentConfigsMod.useAgentConfigs).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useAgentConfigsMod.useAgentConfigs>);

    render(<TemplatesTab />, { wrapper: makeWrapper() });
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('shows error state', () => {
    vi.mocked(useAgentConfigsMod.useAgentConfigs).mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useAgentConfigsMod.useAgentConfigs>);

    render(<TemplatesTab />, { wrapper: makeWrapper() });
    expect(screen.getByRole('alert')).toBeDefined();
  });
});
