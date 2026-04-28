/**
 * TasksPage.test.tsx
 *
 * RTL tests for: Ctrl+N shortcut, empty-state copy, quick-filter pills,
 * inline-complete checkbox, and AddTaskForm org options.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

import { TasksPage } from './TasksPage';
import type { Task, Organization } from '../types';

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
  useOrganizations: vi.fn(),
}));

vi.mock('../api/useContacts', () => ({
  useContacts: vi.fn(() => ({ data: [] })),
}));

import { useTasks } from '../api/useTasks';
import { useOrganizations } from '../api/useOrganizations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(initialEntries: string[] = ['/']) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={qc}>
        <TasksPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

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

function mockOrganizations(orgs: { customer: Organization[]; oem: Organization[] }) {
  vi.mocked(useOrganizations).mockImplementation((type?: 'customer' | 'oem') => {
    const data = type === 'customer' ? orgs.customer : type === 'oem' ? orgs.oem : [...orgs.customer, ...orgs.oem];
    return { data, isLoading: false, isError: false, isSuccess: true } as unknown as ReturnType<typeof useOrganizations>;
  });
}

const SAMPLE_TASK: Task = {
  id: 1,
  title: 'Review proposal',
  status: 'open',
  due_date: null,
  organization_id: null,
  contact_id: null,
  project_id: null,
  created_at: '2026-04-25T07:00:00.000Z',
  completed_at: null,
};

function makeDueTask(dueDate: string, overrideId = 99): Task {
  return { ...SAMPLE_TASK, id: overrideId, due_date: dueDate };
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
  // Default: no orgs
  vi.mocked(useOrganizations).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    isSuccess: true,
  } as unknown as ReturnType<typeof useOrganizations>);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Default empty-state copy
// ---------------------------------------------------------------------------

describe('TasksPage — default empty-state copy', () => {
  it('shows the no-tasks hint when there are no open tasks and filter is All', () => {
    renderPage();
    expect(
      screen.getByText(
        'No open tasks. Add one with Ctrl+N or the + Add task button above.',
      ),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Quick-filter pills — render and roles
// ---------------------------------------------------------------------------

describe('TasksPage — DuePills render', () => {
  it('renders 4 filter pills inside a radiogroup', () => {
    renderPage();
    const group = screen.getByRole('radiogroup', { name: /filter by due date/i });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(radios[0]).toHaveTextContent('All');
    expect(radios[1]).toHaveTextContent('Today');
    expect(radios[2]).toHaveTextContent('This week');
    expect(radios[3]).toHaveTextContent('Overdue');
  });

  it('"All" pill is aria-checked=true by default', () => {
    renderPage();
    const allPill = screen.getByRole('radio', { name: 'All' });
    expect(allPill).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Today' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Quick-filter — Today empty state
// ---------------------------------------------------------------------------

describe('TasksPage — Today quick filter', () => {
  it('shows "No tasks due today" when Today filter is active and list is empty', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('radio', { name: 'Today' }));
    await waitFor(() => {
      expect(screen.getByText('No tasks due today.')).toBeInTheDocument();
    });
  });

  it('"Today" pill becomes aria-checked after click', async () => {
    const user = userEvent.setup();
    renderPage();
    const todayPill = screen.getByRole('radio', { name: 'Today' });
    await user.click(todayPill);
    await waitFor(() => {
      expect(todayPill).toHaveAttribute('aria-checked', 'true');
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Quick-filter — Overdue empty state
// ---------------------------------------------------------------------------

describe('TasksPage — Overdue quick filter', () => {
  it('shows "No overdue tasks — nice work." when Overdue filter is active', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('radio', { name: 'Overdue' }));
    await waitFor(() => {
      expect(
        screen.getByText('No overdue tasks — nice work.'),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Quick-filter — This week empty state
// ---------------------------------------------------------------------------

describe('TasksPage — This week quick filter', () => {
  it('shows "No tasks due this week." when This week filter is active', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('radio', { name: 'This week' }));
    await waitFor(() => {
      expect(screen.getByText('No tasks due this week.')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Quick-filter — arrow key navigation
// ---------------------------------------------------------------------------

describe('TasksPage — DuePills arrow key navigation', () => {
  it('ArrowRight from All focuses and selects Today', async () => {
    const user = userEvent.setup();
    renderPage();
    const allPill = screen.getByRole('radio', { name: 'All' });
    allPill.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Today' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Today' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });

  it('ArrowLeft from All wraps to Overdue', async () => {
    const user = userEvent.setup();
    renderPage();
    const allPill = screen.getByRole('radio', { name: 'All' });
    allPill.focus();
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Overdue' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Overdue' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Inline complete checkbox calls completeTask
// ---------------------------------------------------------------------------

describe('TasksPage — inline complete checkbox', () => {
  it('calls completeTask mutate when checkbox is clicked', async () => {
    mockWithTasks([SAMPLE_TASK]);
    const user = userEvent.setup();
    renderPage();

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(completeMutate).toHaveBeenCalledWith(
      SAMPLE_TASK.id,
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// 8. AddTaskForm org select uses customers only
// ---------------------------------------------------------------------------

describe('TasksPage — inline-add org select uses customers only', () => {
  it('org select shows customer orgs but NOT oem orgs', async () => {
    const customers: Organization[] = [
      {
        id: 10,
        type: 'customer',
        name: 'Acme Corp',
        metadata: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ];
    const oems: Organization[] = [
      {
        id: 20,
        type: 'oem',
        name: 'Cisco',
        metadata: {},
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ];
    mockOrganizations({ customer: customers, oem: oems });

    const user = userEvent.setup();
    renderPage();

    // Open the inline-add form
    await user.click(screen.getByRole('button', { name: /\+ add task/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('New task title')).toBeInTheDocument();
    });

    const orgSelect = screen.getByRole('combobox', { name: /organization/i });
    expect(within(orgSelect as HTMLSelectElement).getByText('Acme Corp')).toBeInTheDocument();
    expect(within(orgSelect as HTMLSelectElement).queryByText('Cisco')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Ctrl+N — form collapsed → expand + focus
// ---------------------------------------------------------------------------

describe('TasksPage — Ctrl+N shortcut (form initially hidden)', () => {
  it('shows the add-task form and focuses the title input when Ctrl+N is pressed', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('button', { name: /\+ add task/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();

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
// Ctrl+N — form already open → re-focus (idempotent)
// ---------------------------------------------------------------------------

describe('TasksPage — Ctrl+N shortcut (form already open)', () => {
  it('re-focuses the title input when Ctrl+N is pressed and form is already open', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /\+ add task/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('New task title')).toBeInTheDocument();
    });

    await user.click(document.body);
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
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <textarea aria-label="External textarea" />
          <TasksPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const textarea = screen.getByRole('textbox', { name: 'External textarea' });
    await user.click(textarea);
    expect(textarea).toHaveFocus();

    await user.keyboard('{Control>}n{/Control}');

    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();
  });

  it('does NOT open the form when focus is inside an input', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Ctrl+N — task list present
// ---------------------------------------------------------------------------

describe('TasksPage — Ctrl+N shortcut (tasks present)', () => {
  it('still opens and focuses the add-task form when tasks exist', async () => {
    mockWithTasks([SAMPLE_TASK]);

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
  it('removes the keydown listener when the component unmounts', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderPage();
    unmount();

    const calls = removeSpy.mock.calls.filter(([event]) => event === 'keydown');
    expect(calls.length).toBeGreaterThanOrEqual(1);

    removeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Quick-filter filters tasks correctly
// ---------------------------------------------------------------------------

describe('TasksPage — quick filter filters displayed tasks', () => {
  it('Today filter shows only tasks due today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
    const todayTask = makeDueTask(today, 1);
    const futureTask = { ...SAMPLE_TASK, id: 2, title: 'Future task', due_date: nextWeek };
    mockWithTasks([todayTask, futureTask]);

    const user = userEvent.setup();
    renderPage();

    // Both visible initially under 'All'
    expect(screen.getByText('Review proposal')).toBeInTheDocument();
    expect(screen.getByText('Future task')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Today' }));
    await waitFor(() => {
      expect(screen.getByText('Review proposal')).toBeInTheDocument();
      expect(screen.queryByText('Future task')).not.toBeInTheDocument();
    });
  });
});
