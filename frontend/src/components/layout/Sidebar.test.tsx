/**
 * Sidebar.test.tsx
 *
 * Keyboard navigation + visual-polish + a11y tests for the sidebar nav.
 * Mock pattern follows ReportsPage.test.tsx / CommandPalette.test.tsx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { CaptureActionRequest, CaptureActionResult } from '../../types';

const captureActionMocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  captureScreenToAttachment: vi.fn(),
  fileToCaptureAttachment: vi.fn(),
  clipboardImagesToCaptureAttachments: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
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

const FIXTURE_OEMS = [
  {
    id: 10,
    type: 'oem' as const,
    name: 'Cisco',
    metadata: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 11,
    type: 'oem' as const,
    name: 'NetApp',
    metadata: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Mocks — must precede SUT import
// ---------------------------------------------------------------------------

vi.mock('../../api/useOrganizations', () => ({
  useOrganizations: vi.fn(),
  useOrgLastTouched: vi.fn(),
}));

vi.mock('../../api/useCaptureAction', () => ({
  useCaptureAction: vi.fn(),
}));

vi.mock('../../utils/captureActionFiles', () => ({
  captureScreenToAttachment: captureActionMocks.captureScreenToAttachment,
  fileToCaptureAttachment: captureActionMocks.fileToCaptureAttachment,
  clipboardImagesToCaptureAttachments: captureActionMocks.clipboardImagesToCaptureAttachments,
}));

// ThemeToggle renders a button we don't want to worry about here — stub it out
// so we have a predictable set of focusables.
vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <button type="button" aria-label="Toggle theme" />,
}));

import { useOrganizations, useOrgLastTouched } from '../../api/useOrganizations';
import { useCaptureAction } from '../../api/useCaptureAction';
import { Sidebar } from './Sidebar';

// ---------------------------------------------------------------------------
// Default mock implementations (reset in beforeEach)
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  vi.mocked(useOrganizations).mockImplementation((type?: string) => ({
    data: type === 'oem' ? FIXTURE_OEMS : FIXTURE_CUSTOMERS,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }) as unknown as UseQueryResult<typeof FIXTURE_CUSTOMERS>);

  vi.mocked(useOrgLastTouched).mockReturnValue({
    data: {} as Record<string, string>,
    isLoading: false,
    isError: false,
  } as unknown as UseQueryResult<Record<string, string>>);

  captureActionMocks.mutateAsync.mockResolvedValue({
    summary: 'Created a reminder.',
    created_tasks: [],
    created_notes: [],
    model_notes: [],
  });
  captureActionMocks.fileToCaptureAttachment.mockImplementation((file: File) =>
    Promise.resolve({
      id: 'dropped-file',
      name: file.name,
      mime_type: file.type || 'application/octet-stream',
      data_base64: 'ZHJvcHBlZA==',
      preview_url: null,
    }),
  );
  captureActionMocks.captureScreenToAttachment.mockResolvedValue({
    id: 'screen-capture',
    name: 'screen-capture.png',
    mime_type: 'image/png',
    data_base64: 'c2NyZWVu',
    preview_url: 'data:image/png;base64,c2NyZWVu',
  });
  captureActionMocks.clipboardImagesToCaptureAttachments.mockResolvedValue([
    {
      id: 'clipboard-image',
      name: 'clipboard.png',
      mime_type: 'image/png',
      data_base64: 'Y2xpcGJvYXJk',
      preview_url: 'data:image/png;base64,Y2xpcGJvYXJk',
    },
  ]);

  vi.mocked(useCaptureAction).mockReturnValue({
    mutateAsync: captureActionMocks.mutateAsync,
    isPending: false,
  } as unknown as UseMutationResult<CaptureActionResult, Error, CaptureActionRequest>);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSidebar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
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
// Clean up between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  setupDefaultMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Capture intake
// ---------------------------------------------------------------------------

describe('Sidebar — capture intake', () => {
  it('opens the prompt modal from a dropped file and submits it with org context', async () => {
    const user = userEvent.setup();
    renderSidebar('/customers/2');

    const captureButton = screen.getByRole('button', {
      name: /capture with mastercontrol/i,
    });
    const file = new File(['Pat says follow up Monday'], 'pat-follow-up.txt', {
      type: 'text/plain',
    });

    fireEvent.drop(captureButton, { dataTransfer: { files: [file] } });

    expect(await screen.findByText('pat-follow-up.txt')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(captureActionMocks.mutateAsync).toHaveBeenCalledWith({
        prompt: expect.stringContaining('Read the attached screenshot or file'),
        organization_id: 2,
        attachments: [
          {
            name: 'pat-follow-up.txt',
            mime_type: 'text/plain',
            data_base64: 'ZHJvcHBlZA==',
          },
        ],
      });
    });
  });

  it('opens the prompt modal from a screen capture and submits the image', async () => {
    const user = userEvent.setup();
    renderSidebar('/customers/2');

    await user.click(screen.getByRole('button', { name: /capture with mastercontrol/i }));

    expect(await screen.findByText('screen-capture.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(captureActionMocks.captureScreenToAttachment).toHaveBeenCalledTimes(1);
      expect(captureActionMocks.mutateAsync).toHaveBeenCalledWith({
        prompt: expect.stringContaining('Read the attached screenshot or file'),
        organization_id: 2,
        attachments: [
          {
            name: 'screen-capture.png',
            mime_type: 'image/png',
            data_base64: 'c2NyZWVu',
          },
        ],
      });
    });
  });

  it('accepts a pasted screenshot from the clipboard and submits it', async () => {
    const user = userEvent.setup();
    captureActionMocks.captureScreenToAttachment.mockRejectedValueOnce(
      new Error('Screen capture unavailable'),
    );
    renderSidebar('/customers/2');

    await user.click(screen.getByRole('button', { name: /capture with mastercontrol/i }));

    const pastedImage = new File(['clipboard image'], 'clipboard.png', {
      type: 'image/png',
    });
    const prompt = await screen.findByLabelText(/prompt/i);
    fireEvent.paste(prompt, {
      clipboardData: {
        items: [
          {
            kind: 'file',
            getAsFile: () => pastedImage,
          },
        ],
      },
    });

    expect(await screen.findByText('clipboard.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(captureActionMocks.mutateAsync).toHaveBeenCalledWith({
        prompt: expect.stringContaining('Read the attached screenshot or file'),
        organization_id: 2,
        attachments: [
          {
            name: 'clipboard.png',
            mime_type: 'image/png',
            data_base64: 'ZHJvcHBlZA==',
          },
        ],
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Rendering smoke test
// ---------------------------------------------------------------------------

describe('Sidebar — rendering', () => {
  it('renders a nav with aria-label="Primary navigation"', () => {
    renderSidebar();
    expect(
      screen.getByRole('navigation', { name: /primary navigation/i }),
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

  it('renders the MasterControl capture button', () => {
    renderSidebar();
    expect(
      screen.getByRole('button', { name: /capture with mastercontrol/i }),
    ).toBeInTheDocument();
  });

  it('nav has aria-label "Primary navigation"', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(nav).toBeInTheDocument();
  });

  it('renders section hairlines (Divider hr elements)', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    const hrElements = nav.querySelectorAll('hr');
    // Expect at least 3 dividers (after top-nav, after customers, after OEM, after AI)
    expect(hrElements.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Active-route highlight
// ---------------------------------------------------------------------------

describe('Sidebar — active route highlight', () => {
  it('active NavLink receives aria-current="page"', () => {
    renderSidebar('/tasks');
    const tasksLink = screen.getByRole('link', { name: /tasks/i });
    expect(tasksLink).toHaveAttribute('aria-current', 'page');
  });

  it('inactive NavLinks do NOT have aria-current="page"', () => {
    renderSidebar('/tasks');
    const homeLink = screen.getByRole('link', { name: /home/i });
    expect(homeLink).not.toHaveAttribute('aria-current', 'page');
  });

  it('active NavLink carries the bg-bg-2 class and border-l-accent class', () => {
    renderSidebar('/tasks');
    const tasksLink = screen.getByRole('link', { name: /tasks/i });
    expect(tasksLink.className).toMatch(/bg-bg-2/);
    expect(tasksLink.className).toMatch(/border-l-accent/);
  });

  it('inactive NavLink carries text-ink-2 class', () => {
    renderSidebar('/tasks');
    const homeLink = screen.getByRole('link', { name: /home/i });
    expect(homeLink.className).toMatch(/text-ink-2/);
  });
});

// ---------------------------------------------------------------------------
// Last-touched activity dot
// ---------------------------------------------------------------------------

describe('Sidebar — last-touched activity dot', () => {
  it('shows dot when customer was touched within 48 h', () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 h ago
    vi.mocked(useOrgLastTouched).mockReturnValue({
      data: { '1': recent },
      isLoading: false,
      isError: false,
    } as unknown as UseQueryResult<Record<string, string>>);

    renderSidebar();

    // Dot is an aria-labelled span inside the Fairview Health NavLink
    const dots = screen.getAllByLabelText('Recent activity');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('dot has aria-label="Recent activity"', () => {
    const recent = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
    vi.mocked(useOrgLastTouched).mockReturnValue({
      data: { '1': recent },
      isLoading: false,
      isError: false,
    } as unknown as UseQueryResult<Record<string, string>>);

    renderSidebar();

    expect(screen.getByLabelText('Recent activity')).toBeInTheDocument();
  });

  it('does NOT show dot when customer was touched more than 48 h ago', () => {
    const old = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(); // 49 h ago
    vi.mocked(useOrgLastTouched).mockReturnValue({
      data: { '1': old, '2': old },
      isLoading: false,
      isError: false,
    } as unknown as UseQueryResult<Record<string, string>>);

    renderSidebar();

    expect(screen.queryByLabelText('Recent activity')).not.toBeInTheDocument();
  });

  it('does NOT show dot when last-touched data is missing / empty', () => {
    vi.mocked(useOrgLastTouched).mockReturnValue({
      data: {},
      isLoading: false,
      isError: false,
    } as unknown as UseQueryResult<Record<string, string>>);

    renderSidebar();

    expect(screen.queryByLabelText('Recent activity')).not.toBeInTheDocument();
  });

  it('does NOT show dot when last-touched data is undefined', () => {
    vi.mocked(useOrgLastTouched).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as UseQueryResult<Record<string, string>>);

    renderSidebar();

    expect(screen.queryByLabelText('Recent activity')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('Sidebar — empty state', () => {
  it('shows empty-state copy when customers list is empty', () => {
    vi.mocked(useOrganizations).mockImplementation(() => ({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }) as unknown as UseQueryResult<typeof FIXTURE_CUSTOMERS>);

    renderSidebar();

    expect(
      screen.getByText(/no customers yet/i),
    ).toBeInTheDocument();
  });

  it('does NOT show empty-state copy when customers exist', () => {
    renderSidebar();
    expect(screen.queryByText(/no customers yet/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Arrow key navigation
// ---------------------------------------------------------------------------

describe('Sidebar — Arrow key navigation', () => {
  it('Down arrow moves focus to the next link', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const focusables = getSidebarFocusables();

    focusables[0]!.focus();
    expect(document.activeElement).toBe(focusables[0]);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(focusables[1]);
  });

  it('Down arrow wraps from the last item to the first', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const focusables = getSidebarFocusables();

    focusables[focusables.length - 1]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(focusables[0]);
  });

  it('Up arrow moves focus to the previous link', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const focusables = getSidebarFocusables();

    focusables[2]!.focus();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(focusables[1]);
  });

  it('Up arrow wraps from the first item to the last', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const focusables = getSidebarFocusables();

    focusables[0]!.focus();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it('Home jumps to the first focusable', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const focusables = getSidebarFocusables();

    focusables[3]!.focus();
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(focusables[0]);
  });

  it('End jumps to the last focusable', async () => {
    const user = userEvent.setup();
    renderSidebar();
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

    await user.keyboard('{Enter}');

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

    await user.type(textarea, 'hello');
    await user.keyboard('{ArrowDown}');

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

    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue('/');
  });
});
