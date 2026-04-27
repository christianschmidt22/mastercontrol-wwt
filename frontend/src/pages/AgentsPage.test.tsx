/**
 * AgentsPage.test.tsx
 *
 * Integration tests for the Phase-1 AgentsPage — section template editor,
 * tools toggles, model picker, save/discard, and per-org overrides.
 *
 * All hooks are mocked at the module level; we exercise only the UI layer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AgentsPage } from './AgentsPage';
import * as useAgentConfigsMod from '../api/useAgentConfigs';
import * as useOrgsMod from '../api/useOrganizations';

// ---------------------------------------------------------------------------
// Mock functions
// ---------------------------------------------------------------------------

const mockUpdateAsync = vi.fn().mockResolvedValue({});
const mockCreateAsync = vi.fn().mockResolvedValue({});
const mockDeleteAsync = vi.fn().mockResolvedValue({});

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const CUSTOMER_DEFAULT = {
  id: 1,
  section: 'customer' as const,
  organization_id: null,
  system_prompt_template: 'Customer default template.',
  tools_enabled: [{ name: 'web_search', max_uses: 5 }, { name: 'record_insight' }] as unknown as Record<string, unknown>,
  model: 'claude-sonnet-4-6',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const OEM_DEFAULT = {
  id: 2,
  section: 'oem' as const,
  organization_id: null,
  system_prompt_template: 'OEM default template.',
  tools_enabled: [{ name: 'record_insight' }] as unknown as Record<string, unknown>,
  model: 'claude-haiku-4-5',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const CUSTOMER_OVERRIDE = {
  id: 3,
  section: 'customer' as const,
  organization_id: 10,
  system_prompt_template: 'Override for Org Alpha.',
  tools_enabled: [] as unknown as Record<string, unknown>,
  model: 'claude-haiku-4-5',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const DEFAULT_CONFIGS = [CUSTOMER_DEFAULT, OEM_DEFAULT, CUSTOMER_OVERRIDE];

const MOCK_ORGS = [
  { id: 10, name: 'Org Alpha', type: 'customer' as const, metadata: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 11, name: 'Org Beta', type: 'customer' as const, metadata: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../api/useAgentConfigs', () => ({
  useAgentConfigs: vi.fn(),
  useUpdateAgentConfig: vi.fn(),
  useCreateAgentConfig: vi.fn(),
  useDeleteAgentConfig: vi.fn(),
}));

vi.mock('../api/useOrganizations', () => ({
  useOrganizations: vi.fn(),
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

function renderPage() {
  return render(<AgentsPage />, { wrapper: makeWrapper() });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateAsync.mockResolvedValue({});
  mockCreateAsync.mockResolvedValue({});
  mockDeleteAsync.mockResolvedValue({});

  vi.mocked(useAgentConfigsMod.useAgentConfigs).mockReturnValue({
    data: DEFAULT_CONFIGS,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useAgentConfigsMod.useAgentConfigs>);

  vi.mocked(useAgentConfigsMod.useUpdateAgentConfig).mockReturnValue({
    mutateAsync: mockUpdateAsync,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useAgentConfigsMod.useUpdateAgentConfig>);

  vi.mocked(useAgentConfigsMod.useCreateAgentConfig).mockReturnValue({
    mutateAsync: mockCreateAsync,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useAgentConfigsMod.useCreateAgentConfig>);

  vi.mocked(useAgentConfigsMod.useDeleteAgentConfig).mockReturnValue({
    mutateAsync: mockDeleteAsync,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useAgentConfigsMod.useDeleteAgentConfig>);

  vi.mocked(useOrgsMod.useOrganizations).mockReturnValue({
    data: MOCK_ORGS,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useOrgsMod.useOrganizations>);
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------

describe('AgentsPage — tab strip', () => {
  it('renders both Customer agent and OEM agent tabs', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /customer agent/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /oem agent/i })).toBeDefined();
  });

  it('starts on the Customer agent tab (aria-selected=true)', () => {
    renderPage();
    const customerTab = screen.getByRole('tab', { name: /customer agent/i });
    expect(customerTab.getAttribute('aria-selected')).toBe('true');
    const oemTab = screen.getByRole('tab', { name: /oem agent/i });
    expect(oemTab.getAttribute('aria-selected')).toBe('false');
  });

  it('clicking OEM agent tab switches aria-selected and shows OEM template', async () => {
    renderPage();
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveProperty('value', 'Customer default template.');

    await userEvent.click(screen.getByRole('tab', { name: /oem agent/i }));

    const oemTab = screen.getByRole('tab', { name: /oem agent/i });
    expect(oemTab.getAttribute('aria-selected')).toBe('true');
    const newTextarea = screen.getByRole('textbox');
    expect(newTextarea).toHaveProperty('value', 'OEM default template.');
  });

  it('ArrowRight key moves focus to OEM tab', async () => {
    renderPage();
    const customerTab = screen.getByRole('tab', { name: /customer agent/i });
    await userEvent.click(customerTab);
    await userEvent.keyboard('{ArrowRight}');
    const oemTab = screen.getByRole('tab', { name: /oem agent/i });
    expect(oemTab.getAttribute('aria-selected')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Section editor — dirty state
// ---------------------------------------------------------------------------

describe('AgentsPage — section editor dirty state', () => {
  it('Save button is disabled when nothing has been changed', () => {
    renderPage();
    const saveBtn = screen.getByRole('button', { name: /save agent config/i });
    expect(saveBtn.hasAttribute('disabled')).toBe(true);
  });

  it('editing the textarea enables the Save button', async () => {
    renderPage();
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, ' extra text');
    const saveBtn = screen.getByRole('button', { name: /save agent config/i });
    await waitFor(() => {
      expect(saveBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('clicking Discard reverts the textarea to the original value', async () => {
    renderPage();
    const textarea = screen.getByRole('textbox');
    const original = 'Customer default template.';
    await userEvent.type(textarea, ' modified');
    expect((textarea as HTMLTextAreaElement).value).toContain('modified');

    await userEvent.click(screen.getByRole('button', { name: /discard changes/i }));
    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe(original);
    });
  });

  it('clicking Save calls the update mutation with the new template', async () => {
    renderPage();
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, ' new content');

    const saveBtn = screen.getByRole('button', { name: /save agent config/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateAsync).toHaveBeenCalledTimes(1);
    });
    const call = mockUpdateAsync.mock.calls[0]?.[0] as { id: number; system_prompt_template: string };
    expect(call.id).toBe(1);
    expect(call.system_prompt_template).toContain('new content');
  });
});

// ---------------------------------------------------------------------------
// Tools toggles
// ---------------------------------------------------------------------------

describe('AgentsPage — tools toggles', () => {
  it('web_search checkbox is checked when the tool is present in tools_enabled', () => {
    renderPage();
    const wsCheckbox = screen.getByRole('checkbox', { name: /web_search/i });
    expect(wsCheckbox.getAttribute('checked') !== null || (wsCheckbox as HTMLInputElement).checked).toBe(true);
  });

  it('toggling web_search checkbox enables the Save button', async () => {
    renderPage();
    const wsCheckbox = screen.getByRole('checkbox', { name: /web_search/i });
    await userEvent.click(wsCheckbox);
    const saveBtn = screen.getByRole('button', { name: /save agent config/i });
    await waitFor(() => {
      expect(saveBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('when web_search is checked, max-uses number input is visible', () => {
    renderPage();
    // web_search is enabled in CUSTOMER_DEFAULT fixture
    expect(screen.getByRole('spinbutton', { name: /max searches/i })).toBeDefined();
  });

  it('unchecking web_search hides the max-uses input', async () => {
    renderPage();
    const wsCheckbox = screen.getByRole('checkbox', { name: /web_search/i });
    await userEvent.click(wsCheckbox); // uncheck
    expect(screen.queryByRole('spinbutton', { name: /max searches/i })).toBeNull();
  });

  it('toggling a tool and saving calls mutation with updated tools_enabled', async () => {
    renderPage();
    const riCheckbox = screen.getByRole('checkbox', { name: /record_insight/i });
    await userEvent.click(riCheckbox); // uncheck record_insight

    await userEvent.click(screen.getByRole('button', { name: /save agent config/i }));

    await waitFor(() => {
      expect(mockUpdateAsync).toHaveBeenCalledTimes(1);
    });
    const call = mockUpdateAsync.mock.calls[0]?.[0] as { tools_enabled: unknown };
    // record_insight should no longer be in the serialized array
    const tools = call.tools_enabled as Array<{ name: string }>;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.some((t) => t.name === 'record_insight')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Model picker
// ---------------------------------------------------------------------------

describe('AgentsPage — model picker', () => {
  it('model picker shows the current model', () => {
    renderPage();
    const select = screen.getByRole('combobox');
    expect((select as HTMLSelectElement).value).toBe('claude-sonnet-4-6');
  });

  it('changing the model enables Save and calls mutation on save', async () => {
    renderPage();
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'claude-opus-4-7');

    const saveBtn = screen.getByRole('button', { name: /save agent config/i });
    expect(saveBtn.hasAttribute('disabled')).toBe(false);

    await userEvent.click(saveBtn);
    await waitFor(() => {
      expect(mockUpdateAsync).toHaveBeenCalledTimes(1);
    });
    const call = mockUpdateAsync.mock.calls[0]?.[0] as { model: string };
    expect(call.model).toBe('claude-opus-4-7');
  });
});

// ---------------------------------------------------------------------------
// Per-org overrides
// ---------------------------------------------------------------------------

describe('AgentsPage — per-org overrides', () => {
  it('override list shows entries with organization_id NOT NULL', () => {
    renderPage();
    // CUSTOMER_OVERRIDE has organization_id: 10 → Org Alpha
    expect(screen.getByText('Org Alpha')).toBeDefined();
  });

  it('"Add override" button opens the org picker', async () => {
    renderPage();
    const addBtn = screen.getByRole('button', { name: /add per-org override/i });
    await userEvent.click(addBtn);
    // Picker select should appear
    expect(screen.getByRole('combobox', { name: /select organization/i })).toBeDefined();
  });

  it('selecting an org in the picker calls the create mutation', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /add per-org override/i }));

    const picker = screen.getByRole('combobox', { name: /select organization/i });
    // Org Beta (id=11) is available; Org Alpha (id=10) already has an override
    await userEvent.selectOptions(picker, '11');

    await waitFor(() => {
      expect(mockCreateAsync).toHaveBeenCalledTimes(1);
    });
    const call = mockCreateAsync.mock.calls[0]?.[0] as { section: string; organization_id: number };
    expect(call.section).toBe('customer');
    expect(call.organization_id).toBe(11);
  });

  it('"Edit override" expands the inline panel for that org', async () => {
    renderPage();
    const editBtn = screen.getByRole('button', { name: /edit override for org alpha/i });
    await userEvent.click(editBtn);
    // Delete override button should now be visible
    expect(screen.getByRole('button', { name: /delete override for org alpha/i })).toBeDefined();
  });

  it('"Delete override" calls the delete mutation with the config id', async () => {
    renderPage();
    // Expand the override panel for Org Alpha
    await userEvent.click(screen.getByRole('button', { name: /edit override for org alpha/i }));

    const deleteBtn = screen.getByRole('button', { name: /delete override for org alpha/i });
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockDeleteAsync.mock.calls[0]?.[0]).toBe(3); // config id=3
  });
});
