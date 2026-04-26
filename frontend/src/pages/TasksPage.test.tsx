/**
 * TasksPage.test.tsx
 *
 * RTL tests for the Ctrl+N keyboard shortcut and empty-state copy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

import { TasksPage } from './TasksPage';
import type { Task } from '../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const completeMutate = vi.fn();

vi.mock('../api/useTasks', () => ({
  useTasks: vi.fn(),
  useCreateTask: vi.fn(() => ({ mutate: createMutate, isPending: false })),
  useUpdateTask: vi.fn(() => ({ mutate: updateMutate, isPending: false })),
  useDeleteTask: vi.fn(() => ({ mutate: deleteMutate, isPending: false })),
  useCompleteTask: vi.fn(() => ({ mutate: completeMutate, isPending: false })),
}));

vi.mock('../api/useOrganizations', () => ({
  useOrganizations: vi.fn(() => ({ data: [] })),
}));

vi.mock('../api/useContacts', () => ({
  useContacts: vi.fn(() => ({ data: [] })),
}));

import { useTasks } from '../api/useTasks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TasksPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// Mock a stable empty task list response for most tests.
function mockEmptyTasks() {
  vi.mocked(useTasks).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    isSuccess: true,
  } as unknown as ReturnType<typeof useTasks>);
}

function mockWithTasks(tasks: Task[]) {
  vi.mocked(useTasks).mockReturnValue({
    data: tasks,
    isLoading: false,
    isError: false,
    isSuccess: true,
  } as unknown as ReturnType<typeof useTasks>);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  createMutate.mockReset();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  completeMutate.mockReset();
  mockEmptyTasks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Empty-state copy
// ---------------------------------------------------------------------------

describe('TasksPage — empty-state copy', () => {
  it('shows the Windows-form shortcut hint when there are no open tasks', () => {
    renderPage();
    expect(
      screen.getByText(
        'No open tasks. Add one with Ctrl+N or the + Add task button above.',
      ),
    ).toBeInTheDocument();
  });

  it('does NOT show the hint when filters are active (filtered empty state)', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Render with a ?due=today param so isFiltered=true
    render(
      <MemoryRouter initialEntries={['/?due=today']}>
        <QueryClientProvider client={qc}>
          <TasksPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(
      screen.queryByText(/ctrl\+n/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('No tasks match these filters.'),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Ctrl+N — form collapsed → expand + focus
// ---------------------------------------------------------------------------

describe('TasksPage — Ctrl+N shortcut (form initially hidden)', () => {
  it('shows the add-task form and focuses the title input when Ctrl+N is pressed', async () => {
    const user = userEvent.setup();
    renderPage();

    // The "+ Add task" button is visible; the input is not yet mounted.
    expect(screen.getByRole('button', { name: /\+ add task/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();

    await user.keyboard('{Control>}n{/Control}');

    await waitFor(() => {
      expect(screen.getByLabelText('New task title')).toBeInTheDocument();
    });

    // The input should have focus.
    await waitFor(() => {
      expect(screen.getByLabelText('New task title')).toHaveFocus();
    });
  });
});

// ---------------------------------------------------------------------------
// Ctrl+N — form already open → re-focus (idempotent)
// ---------------------------------------------------------------------------

describe('TasksPage — Ctrl+N shortcut (form already open)', () => {
  it('re-focuses the title input when Ctrl+N is pressed and form is already open', async () => {
    const user = userEvent.setup();
    renderPage();

    // Open via button first.
    await user.click(screen.getByRole('button', { name: /\+ add task/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('New task title')).toBeInTheDocument();
    });

    // Click elsewhere to blur the input.
    await user.click(document.body);

    // Now press Ctrl+N — should re-focus.
    await user.keyboard('{Control>}n{/Control}');

    await waitFor(() => {
      expect(screen.getByLabelText('New task title')).toHaveFocus();
    });
  });
});

// ---------------------------------------------------------------------------
// Ctrl+N inside a textarea — must NOT intercept
// ---------------------------------------------------------------------------

describe('TasksPage — Ctrl+N shortcut (focus inside textarea)', () => {
  it('does NOT open or focus the add-task form when focus is inside a textarea', async () => {
    const user = userEvent.setup();
    // Render a textarea alongside the page inside the same tree.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <textarea aria-label="External textarea" />
          <TasksPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const textarea = screen.getByRole('textbox', { name: 'External textarea' });

    // Focus the textarea, then fire Ctrl+N while focus is there.
    await user.click(textarea);
    expect(textarea).toHaveFocus();

    await user.keyboard('{Control>}n{/Control}');

    // The add-task form should NOT have appeared.
    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();
  });

  it('does NOT open the form when focus is inside an input', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <input aria-label="External input" type="text" />
          <TasksPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const externalInput = screen.getByRole('textbox', { name: 'External input' });
    await user.click(externalInput);
    expect(externalInput).toHaveFocus();

    await user.keyboard('{Control>}n{/Control}');

    // The add-task form should NOT have appeared.
    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Ctrl+N — task list present (non-empty state still has the affordance)
// ---------------------------------------------------------------------------

describe('TasksPage — Ctrl+N shortcut (tasks present)', () => {
  it('still opens and focuses the add-task form when tasks exist', async () => {
    const sampleTask: Task = {
      id: 1,
      title: 'Review proposal',
      status: 'open',
      due_date: null,
      organization_id: null,
      contact_id: null,
      created_at: '2026-04-25T07:00:00.000Z',
      completed_at: null,
    };
    mockWithTasks([sampleTask]);

    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText('Review proposal')).toBeInTheDocument();

    await user.keyboard('{Control>}n{/Control}');

    await waitFor(() => {
      expect(screen.getByLabelText('New task title')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('New task title')).toHaveFocus();
    });
  });
});

// ---------------------------------------------------------------------------
// Listener cleanup
// ---------------------------------------------------------------------------

describe('TasksPage — Ctrl+N listener cleanup', () => {
  it('removes the keydown listener when the component unmounts', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderPage();
    unmount();

    const calls = removeSpy.mock.calls.filter(
      ([event]) => event === 'keydown',
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);

    removeSpy.mockRestore();
  });
});
