/**
 * SettingsPage.test.tsx
 *
 * Phase 1 SettingsPage behaviour tests.
 * Wrapped in <QueryClientProvider retry:false> per project convention.
 *
 * Covers:
 *   1.  API key masked initially (read-only)
 *   2.  Clicking Edit reveals password input
 *   3.  Save calls mutation with entered value
 *   4.  Cancel reverts to masked display
 *   5.  AuthModeSection renders (delegation auth surface)
 *   6.  Model select calls mutation immediately on change (no separate Save)
 *   7.  Theme radio updates document.documentElement class + mutation
 *   8.  Paths inputs are read-only
 *
 * AuthModeSection (subscription-login + API-key fallback) is stubbed
 * here — its full behaviour is covered by AuthModeSection.test.tsx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { SettingsPage } from './SettingsPage';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mutateMock = vi.fn();

vi.mock('../api/useSettings', () => ({
  useSetting: vi.fn((key: string) => {
    const data: Record<string, { key: string; value: string }> = {
      anthropic_api_key: { key: 'anthropic_api_key', value: 'sk-ant-...ABCD' },
      personal_anthropic_api_key: {
        key: 'personal_anthropic_api_key',
        value: 'sk-ant-...EFGH',
      },
      default_model: { key: 'default_model', value: 'claude-sonnet-4-6' },
      workvault_path: {
        key: 'workvault_path',
        value: 'C:\\Users\\test\\WorkVault',
      },
      onedrive_path: {
        key: 'onedrive_path',
        value: 'C:\\Users\\test\\OneDrive',
      },
    };
    return { data: data[key] ?? null, isLoading: false };
  }),
  useSetSetting: vi.fn(() => ({
    mutateAsync: mutateMock,
    isPending: false,
  })),
}));

const setThemeMock = vi.fn();

vi.mock('../store/useUiStore', () => ({
  useUiStore: vi.fn(() => ({
    theme: 'dark' as const,
    setTheme: setThemeMock,
  })),
}));

// AuthModeSection has its own behaviour test; stub it here so SettingsPage
// tests don't need to mock useSubagent / useAuthStatus / fetch.
vi.mock('../components/agents/AuthModeSection', () => ({
  AuthModeSection: () => (
    <section aria-labelledby="section-delegation-auth">
      <h2 id="section-delegation-auth">Delegation Authentication</h2>
    </section>
  ),
}));

// ─── Render helper ────────────────────────────────────────────────────────────

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsPage', () => {
  beforeEach(() => {
    mutateMock.mockResolvedValue(undefined);
    setThemeMock.mockReset();
    document.documentElement.classList.remove('light', 'dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('light', 'dark');
  });

  // 1 ──────────────────────────────────────────────────────────────────────────
  it('shows masked Anthropic API key in a read-only input initially', () => {
    renderPage();
    const input = screen.getByDisplayValue('sk-ant-...ABCD');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('readonly');
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it('clicking Edit on API key section reveals a password-type input', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: /edit anthropic api key/i }),
    );

    const input = screen.getByLabelText('Anthropic API Key', { selector: 'input' });
    expect(input).toHaveAttribute('type', 'password');
    expect(input).not.toHaveAttribute('readonly');
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it('saving API key calls mutation with the entered value', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: /edit anthropic api key/i }),
    );

    await user.type(
      screen.getByLabelText('Anthropic API Key', { selector: 'input' }),
      'sk-ant-newvalue',
    );

    await user.click(screen.getByRole('button', { name: /save api key/i }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith({
        key: 'anthropic_api_key',
        value: 'sk-ant-newvalue',
      });
    });
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it('cancelling API key edit reverts to masked read-only display', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: /edit anthropic api key/i }),
    );
    // Confirm edit mode
    expect(
      screen.getByLabelText('Anthropic API Key', { selector: 'input' }),
    ).toHaveAttribute('type', 'password');

    // Cancel — only one Cancel button visible (personal key still in display mode)
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Masked input returns; Cancel button gone
    expect(screen.getByDisplayValue('sk-ant-...ABCD')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it('renders the AuthModeSection (subscription login + API-key fallback)', () => {
    renderPage();
    // AuthModeSection has its own h2 'Delegation Authentication'.
    expect(
      screen.getByRole('heading', { name: /delegation authentication/i }),
    ).toBeInTheDocument();
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it('model select calls mutation immediately on change (no separate Save button)', async () => {
    const user = userEvent.setup();
    renderPage();

    const select = screen.getByRole('combobox', { name: /model/i });
    await user.selectOptions(select, 'claude-opus-4-7');

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith({
        key: 'default_model',
        value: 'claude-opus-4-7',
      });
    });

    // No save button should exist in this section
    expect(
      screen.queryByRole('button', { name: /save model/i }),
    ).not.toBeInTheDocument();
  });

  // 9 ──────────────────────────────────────────────────────────────────────────
  it('theme radio updates document root class AND calls mutation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('radio', { name: /^light$/i }));

    // Synchronous DOM update
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Zustand setTheme called
    expect(setThemeMock).toHaveBeenCalledWith('light');

    // Backend mutation called
    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith({
        key: 'theme',
        value: 'light',
      });
    });
  });

  // 10 ─────────────────────────────────────────────────────────────────────────
  it('both paths inputs are read-only', () => {
    renderPage();

    const workvault = screen.getByDisplayValue('C:\\Users\\test\\WorkVault');
    const onedrive = screen.getByDisplayValue('C:\\Users\\test\\OneDrive');

    expect(workvault).toHaveAttribute('readonly');
    expect(onedrive).toHaveAttribute('readonly');
  });
});
