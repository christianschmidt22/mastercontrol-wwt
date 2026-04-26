/**
 * Sidebar.test.tsx
 *
 * Keyboard navigation tests for the sidebar nav.
 * Mock pattern follows ReportsPage.test.tsx / CommandPalette.test.tsx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — must precede SUT import
// ---------------------------------------------------------------------------

const FIXTURE_CUSTOMERS = [
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
];

vi.mock('../../api/useOrganizations', () => ({
  useOrganizations: vi.fn(() => ({
    data: FIXTURE_CUSTOMERS,
    isLoading: false,
    isError: false,
  })),
}));

// ThemeToggle renders a button we don't want to worry about here — stub it out
// so we have a predictable set of focusables.
vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <button type="button" aria-label="Toggle theme" />,
}));

import { Sidebar } from './Sidebar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Sidebar />
    </MemoryRouter>,
  );
}

/**
 * Returns all anchor and enabled-button elements inside the sidebar <nav> in
 * DOM order, mirroring the production getSidebarFocusables logic.
 */
function getSidebarFocusables(): HTMLElement[] {
  const nav = screen.getByRole('navigation', { name: /primary/i });
  return Array.from(
    nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
  );
}

// ---------------------------------------------------------------------------
// Clean up the global "/" listener between tests to avoid cross-test leakage.
// ---------------------------------------------------------------------------
afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering smoke test
// ---------------------------------------------------------------------------

describe('Sidebar — rendering', () => {
  it('renders a nav with role=navigation and aria-label="Primary"', () => {
    renderSidebar();
    expect(
      screen.getByRole('navigation', { name: /primary/i }),
    ).toBeInTheDocument();
  });

  it('renders expected nav links', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /fairview health/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /metro medical/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders + Add customer button', () => {
    renderSidebar();
    expect(
      screen.getByRole('button', { name: /add customer/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Arrow key navigation
// ---------------------------------------------------------------------------

describe('Sidebar — Arrow key navigation', () => {
  beforeEach(() => {
    renderSidebar();
  });

  it('Down arrow moves focus to the next link', async () => {
    const user = userEvent.setup();
    const focusables = getSidebarFocusables();

    // Focus the first item, then arrow down.
    focusables[0]!.focus();
    expect(document.activeElement).toBe(focusables[0]);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(focusables[1]);
  });

  it('Down arrow wraps from the last item to the first', async () => {
    const user = userEvent.setup();
    const focusables = getSidebarFocusables();

    focusables[focusables.length - 1]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(focusables[0]);
  });

  it('Up arrow moves focus to the previous link', async () => {
    const user = userEvent.setup();
    const focusables = getSidebarFocusables();

    focusables[2]!.focus();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(focusables[1]);
  });

  it('Up arrow wraps from the first item to the last', async () => {
    const user = userEvent.setup();
    const focusables = getSidebarFocusables();

    focusables[0]!.focus();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it('Home jumps to the first focusable', async () => {
    const user = userEvent.setup();
    const focusables = getSidebarFocusables();

    focusables[3]!.focus();
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(focusables[0]);
  });

  it('End jumps to the last focusable', async () => {
    const user = userEvent.setup();
    const focusables = getSidebarFocusables();

    focusables[0]!.focus();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });
});

// ---------------------------------------------------------------------------
// Enter activates the focused link (route changes)
// ---------------------------------------------------------------------------

describe('Sidebar — Enter activates focused link', () => {
  it('Enter on a NavLink navigates to its route', async () => {
    const user = userEvent.setup();
    renderSidebar();

    const tasksLink = screen.getByRole('link', { name: /tasks/i });
    tasksLink.focus();

    // userEvent.keyboard('{Enter}') fires the native click on the anchor,
    // which React Router intercepts. The aria-current attribute should change
    // to "page" on the Tasks link after navigation.
    await user.keyboard('{Enter}');

    // After navigation the Tasks link should become aria-current="page".
    expect(tasksLink).toHaveAttribute('aria-current', 'page');
  });
});

// ---------------------------------------------------------------------------
// Space activates a focused anchor link
// ---------------------------------------------------------------------------

describe('Sidebar — Space activates focused anchor link', () => {
  it('Space on a NavLink fires click (simulated via click spy)', async () => {
    const user = userEvent.setup();
    renderSidebar();

    const reportsLink = screen.getByRole('link', { name: /reports/i });

    // Spy on click to confirm Space dispatches it.
    const clickSpy = vi.fn();
    reportsLink.addEventListener('click', clickSpy);

    reportsLink.focus();
    await user.keyboard(' ');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    reportsLink.removeEventListener('click', clickSpy);
  });
});

// ---------------------------------------------------------------------------
// "/" shortcut focuses first sidebar link from outside
// ---------------------------------------------------------------------------

describe('Sidebar — "/" shortcut', () => {
  it('pressing "/" when focus is outside the sidebar focuses the first link', async () => {
    const user = userEvent.setup();

    // Render a fixture with a button outside the sidebar that holds focus.
    render(
      <MemoryRouter initialEntries={['/']}>
        <button type="button" data-testid="outside-btn">
          Outside
        </button>
        <Sidebar />
      </MemoryRouter>,
    );

    const outsideBtn = screen.getByTestId('outside-btn');
    outsideBtn.focus();
    expect(document.activeElement).toBe(outsideBtn);

    await user.keyboard('/');

    // First focusable inside the sidebar should now have focus.
    const nav = screen.getByRole('navigation', { name: /primary/i });
    const firstFocusable = nav.querySelector<HTMLElement>('a[href], button:not([disabled])');
    expect(document.activeElement).toBe(firstFocusable);
  });
});

// ---------------------------------------------------------------------------
// Arrow keys NOT intercepted when focus is inside a textarea
// ---------------------------------------------------------------------------

describe('Sidebar — no interception inside textarea', () => {
  it('ArrowDown inside a textarea does not move sidebar focus', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <textarea data-testid="composer" aria-label="Compose message" />
        <Sidebar />
      </MemoryRouter>,
    );

    const textarea = screen.getByTestId('composer');
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    // Type something so there's a defined cursor position, then press ArrowDown.
    await user.type(textarea, 'hello');
    await user.keyboard('{ArrowDown}');

    // Focus must remain on the textarea — sidebar should not have stolen it.
    expect(document.activeElement).toBe(textarea);
  });

  it('"/" inside an input does not focus the sidebar', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <input data-testid="search-input" aria-label="Search" />
        <Sidebar />
      </MemoryRouter>,
    );

    const input = screen.getByTestId('search-input');
    input.focus();

    await user.keyboard('/');

    // The "/" character should have been typed into the input, and focus
    // must remain there.
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue('/');
  });
});
