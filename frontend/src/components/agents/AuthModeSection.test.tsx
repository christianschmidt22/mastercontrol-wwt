/**
 * AuthModeSection.test.tsx
 *
 * Tests for the Delegation Authentication settings section.
 * Hooks are mocked — no network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AuthModeSection } from './AuthModeSection';
import type { AuthStatus } from '../../types/subagent';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockStatus: AuthStatus | null = null;
let mockIsLoading = false;
const mockInvalidate = vi.fn();

vi.mock('../../api/useSubagent', () => ({
  useAuthStatus: () => ({
    data: mockStatus,
    isLoading: mockIsLoading,
  }),
  subagentKeys: {
    authStatus: () => ['subagent', 'auth-status'],
  },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    useQueryClient: () => ({
      invalidateQueries: mockInvalidate,
    }),
  };
});

vi.mock('../../api/useSettings', () => ({
  useSetting: () => ({ data: null }),
  useSetSetting: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function renderSection() {
  return render(<AuthModeSection />, { wrapper: Wrapper });
}

beforeEach(() => {
  mockStatus = null;
  mockIsLoading = false;
  mockInvalidate.mockReset();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('AuthModeSection — rendering', () => {
  it('renders the section heading', () => {
    renderSection();
    expect(screen.getByRole('heading', { name: /delegation authentication/i })).toBeInTheDocument();
  });

  it('shows both subscription and API key cards', () => {
    renderSection();
    expect(screen.getByText(/subscription login/i)).toBeInTheDocument();
    expect(screen.getByText(/api key \(fallback\)/i)).toBeInTheDocument();
  });

  it('renders the Re-check status button', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /re-check/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Status pill — authenticated
// ---------------------------------------------------------------------------

describe('AuthModeSection — subscription status', () => {
  it('shows Authenticated when subscription_authenticated=true', () => {
    mockStatus = { subscription_authenticated: true, api_key_configured: false };
    renderSection();
    expect(screen.getByRole('status')).toHaveTextContent(/authenticated/i);
  });

  it('shows not-authenticated copy when subscription_authenticated=false', () => {
    mockStatus = { subscription_authenticated: false, api_key_configured: false };
    renderSection();
    expect(screen.getByRole('status')).toHaveTextContent(/not authenticated/i);
  });

  it('shows status-unknown copy when status is null (endpoint missing)', () => {
    mockStatus = null;
    renderSection();
    expect(screen.getByRole('status')).toHaveTextContent(/status unknown/i);
  });

  it('shows claude /login instructions when not authenticated', () => {
    mockStatus = { subscription_authenticated: false, api_key_configured: false };
    renderSection();
    // Multiple elements may contain the text; just confirm at least one is present
    const matches = screen.getAllByText(/claude \/login/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Re-check button
// ---------------------------------------------------------------------------

describe('AuthModeSection — Re-check button', () => {
  it('calls invalidateQueries with auth-status key on click', () => {
    renderSection();
    const btn = screen.getByRole('button', { name: /re-check/i });
    fireEvent.click(btn);
    expect(mockInvalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['subagent', 'auth-status'] }),
    );
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('AuthModeSection — loading state', () => {
  it('shows "Checking…" in status pill when isLoading is true', () => {
    mockIsLoading = true;
    renderSection();
    expect(screen.getByRole('status')).toHaveTextContent(/checking/i);
  });

  it('disables the Re-check button while loading', () => {
    mockIsLoading = true;
    renderSection();
    expect(screen.getByRole('button', { name: /re-check/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Both modes set
// ---------------------------------------------------------------------------

describe('AuthModeSection — both modes configured', () => {
  it('shows Authenticated when both subscription and api_key_configured are true', () => {
    mockStatus = { subscription_authenticated: true, api_key_configured: true };
    renderSection();
    expect(screen.getByRole('status')).toHaveTextContent(/authenticated/i);
  });

  it('hides the login instructions when subscription is authenticated', () => {
    mockStatus = { subscription_authenticated: true, api_key_configured: true };
    renderSection();
    expect(screen.queryByText(/claude \/login/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// API-key card — save button dirty state
// ---------------------------------------------------------------------------

describe('AuthModeSection — API-key card save button', () => {
  it('Save Key button is disabled before any text is typed', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /save key/i })).toBeDisabled();
  });

  it('Save Key button enables after typing a value into the API key input', () => {
    renderSection();
    const input = screen.getByLabelText(/personal anthropic api key/i);
    fireEvent.change(input, { target: { value: 'sk-ant-test123' } });
    expect(screen.getByRole('button', { name: /save key/i })).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// A11y — section structure
// ---------------------------------------------------------------------------

describe('AuthModeSection — a11y', () => {
  it('section element is labelled by its heading via aria-labelledby', () => {
    renderSection();
    const heading = screen.getByRole('heading', { name: /delegation authentication/i });
    expect(heading.id).toBe('section-delegation-auth');
    const section = heading.closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'section-delegation-auth');
  });
});
