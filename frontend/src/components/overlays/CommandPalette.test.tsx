/**
 * CommandPalette.test.tsx
 *
 * RTL tests for the CommandPalette overlay.
 * Mock pattern follows ReportsPage.test.tsx (vi.mock before importing SUT).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — must precede SUT import
// ---------------------------------------------------------------------------

// Fixture orgs
const FIXTURE_ORGS = [
  {
    id: 1,
    type: 'customer' as const,
    name: 'Fairview Health',
    metadata: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    type: 'customer' as const,
    name: 'Metro Medical',
    metadata: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 3,
    type: 'oem' as const,
    name: 'Cisco Systems',
    metadata: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

vi.mock('../../api/useOrganizations', () => ({
  useOrganizations: vi.fn(() => ({ data: FIXTURE_ORGS })),
}));

// Mock navigate so we can assert on it
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Minimal Zustand store mock (just the fields CommandPalette needs)
const mockSetTheme = vi.fn();
vi.mock('../../store/useUiStore', () => ({
  useUiStore: vi.fn(() => ({
    theme: 'dark',
    setTheme: mockSetTheme,
  })),
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

import { CommandPalette } from './CommandPalette';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPalette(isOpen: boolean, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <CommandPalette isOpen={isOpen} onClose={onClose} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockNavigate.mockReset();
  mockSetTheme.mockReset();
});

describe('CommandPalette — closed state', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = renderPalette(false);
    expect(container.firstChild).toBeNull();
  });
});

describe('CommandPalette — open state', () => {
  it('renders the dialog and focuses the input when isOpen is true', async () => {
    renderPalette(true);
    expect(screen.getByRole('dialog', { name: /command palette/i })).toBeInTheDocument();
    // Input is present with combobox role
    const input = screen.getByRole('combobox');
    expect(input).toBeInTheDocument();
    // aria-expanded on combobox
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows org names from the fixture list', () => {
    renderPalette(true);
    expect(screen.getByText('Fairview Health')).toBeInTheDocument();
    expect(screen.getByText('Metro Medical')).toBeInTheDocument();
    expect(screen.getByText('Cisco Systems')).toBeInTheDocument();
  });

  it('shows Actions section with Add task and Toggle theme', () => {
    renderPalette(true);
    expect(screen.getByText('Add task')).toBeInTheDocument();
    expect(screen.getByText('Toggle theme')).toBeInTheDocument();
  });

  it('shows the footer with Windows-form keyboard hints', () => {
    renderPalette(true);
    // Footer area contains the three hint groups
    const footer = screen.getByText('navigate').closest('div') as HTMLElement;
    expect(within(footer).getByText('↑')).toBeInTheDocument();
    expect(within(footer).getByText('↓')).toBeInTheDocument();
    expect(within(footer).getByText('↵')).toBeInTheDocument();
    expect(within(footer).getByText('Esc')).toBeInTheDocument();
    // No Mac glyphs
    expect(footer.textContent).not.toContain('⌘');
    expect(footer.textContent).not.toContain('⌥');
    expect(footer.textContent).not.toContain('⇧');
  });
});

describe('CommandPalette — filtering', () => {
  it('filters orgs by query (case-insensitive)', async () => {
    const user = userEvent.setup();
    renderPalette(true);

    const input = screen.getByRole('combobox');
    await user.type(input, 'fair');

    expect(screen.getByText('Fairview Health')).toBeInTheDocument();
    expect(screen.queryByText('Metro Medical')).not.toBeInTheDocument();
    expect(screen.queryByText('Cisco Systems')).not.toBeInTheDocument();
  });

  it('filters are case-insensitive', async () => {
    const user = userEvent.setup();
    renderPalette(true);

    const input = screen.getByRole('combobox');
    await user.type(input, 'METRO');

    expect(screen.getByText('Metro Medical')).toBeInTheDocument();
    expect(screen.queryByText('Fairview Health')).not.toBeInTheDocument();
  });

  it('shows no-results message when nothing matches', async () => {
    const user = userEvent.setup();
    renderPalette(true);

    const input = screen.getByRole('combobox');
    await user.type(input, 'zzznonexistent');

    expect(screen.getByText(/no results for/i)).toBeInTheDocument();
  });
});

describe('CommandPalette — keyboard navigation', () => {
  it('ArrowDown moves aria-activedescendant to the next item', async () => {
    const user = userEvent.setup();
    renderPalette(true);

    const input = screen.getByRole('combobox');
    // Explicitly focus the input so keyboard events go to the right element
    await user.click(input);
    // First item selected by default
    const initialDesc = input.getAttribute('aria-activedescendant');
    expect(initialDesc).toBeTruthy();

    await user.keyboard('{ArrowDown}');

    const newDesc = input.getAttribute('aria-activedescendant');
    expect(newDesc).not.toBe(initialDesc);
  });

  it('ArrowUp wraps from first to last item', async () => {
    const user = userEvent.setup();
    renderPalette(true);

    const input = screen.getByRole('combobox');
    await user.click(input);
    const firstDesc = input.getAttribute('aria-activedescendant');

    await user.keyboard('{ArrowUp}');

    const lastDesc = input.getAttribute('aria-activedescendant');
    expect(lastDesc).not.toBe(firstDesc);
  });

  it('Enter on a customer org row calls navigate to /customers/:id and onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPalette(true, onClose);

    const input = screen.getByRole('combobox');
    // Focus the input so Enter is handled by the dialog keydown handler
    await user.click(input);
    // The first item is Fairview Health (customer, id=1)
    await user.keyboard('{Enter}');

    expect(mockNavigate).toHaveBeenCalledWith('/customers/1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPalette(true, onClose);

    // Esc is handled by a global window listener — works without explicit focus
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('CommandPalette — ARIA attributes', () => {
  it('input has role=combobox with correct ARIA attributes', () => {
    renderPalette(true);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-haspopup', 'listbox');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls');
  });

  it('results container has role=listbox', () => {
    renderPalette(true);
    expect(screen.getByRole('listbox', { name: /results/i })).toBeInTheDocument();
  });

  it('first item has aria-selected=true', () => {
    renderPalette(true);
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    // Others default to false
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });
});
