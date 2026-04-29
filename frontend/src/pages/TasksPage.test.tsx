import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TasksPage } from './TasksPage';
import type { Organization, Task } from '../types';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const completeMutate = vi.fn();

vi.mock('../api/useTasks', () => ({
  useTasks: vi.fn(),
  useCreateTask: vi.fn(() => ({ mutate: createMutate, isPending: false })),
  useUpdateTask: vi.fn(() => ({ mutate: updateMutate, isPending: false })),
  useCompleteTask: vi.fn(() => ({ mutate: completeMutate, isPending: false })),
}));

vi.mock('../api/useOrganizations', () => ({
  useOrganizations: vi.fn(),
}));

import { useTasks } from '../api/useTasks';
import { useOrganizations } from '../api/useOrganizations';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TasksPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const chr: Organization = {
  id: 2,
  type: 'customer',
  name: 'C.H. Robinson',
  metadata: {},
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const openTask: Task = {
  id: 7,
  organization_id: 2,
  contact_id: null,
  project_id: 14,
  title: 'Schedule design review',
  due_date: '2026-05-01',
  status: 'open',
  created_at: '2026-04-29 00:35:23',
  completed_at: null,
};

const doneTask: Task = {
  ...openTask,
  id: 8,
  title: 'Send recap',
  status: 'done',
  completed_at: '2026-04-29 00:45:23',
};

beforeEach(() => {
  vi.mocked(useTasks).mockReturnValue({
    data: [openTask, doneTask],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTasks>);

  vi.mocked(useOrganizations).mockImplementation((type?: 'customer' | 'oem') => ({
    data: type === 'customer' ? [chr] : [],
    isLoading: false,
    isError: false,
  }) as unknown as ReturnType<typeof useOrganizations>);

  createMutate.mockReset();
  updateMutate.mockReset();
  completeMutate.mockReset();
});

describe('TasksPage table', () => {
  it('renders tasks in a column table with header filters', () => {
    renderPage();

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^task$/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Filter tasks by title')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter tasks by organization')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter tasks by status')).toBeInTheDocument();
    expect(screen.getByText('Schedule design review')).toBeInTheDocument();
    expect(screen.queryByText('Send recap')).not.toBeInTheDocument();
  });

  it('shows done tasks when the status header filter changes', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Filter tasks by status'), 'all');

    expect(screen.getByText('Schedule design review')).toBeInTheDocument();
    expect(screen.getByText('Send recap')).toBeInTheDocument();
  });

  it('clicking an unchecked box completes, and unchecking a done row reopens', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('checkbox', { name: /mark complete: schedule/i }));
    expect(completeMutate).toHaveBeenCalledWith(7);

    await user.selectOptions(screen.getByLabelText('Filter tasks by status'), 'all');
    await user.click(screen.getByRole('checkbox', { name: /reopen task: send recap/i }));
    expect(updateMutate).toHaveBeenCalledWith({ id: 8, status: 'open' });
  });

  it('sorts by title when the Task header is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Filter tasks by status'), 'all');
    await user.click(screen.getByRole('button', { name: /^task$/i }));

    const bodyRows = within(screen.getByRole('table')).getAllByRole('row').slice(2);
    expect(bodyRows[0]).toHaveTextContent('Schedule design review');
    expect(bodyRows[1]).toHaveTextContent('Send recap');

    await user.click(screen.getByRole('button', { name: /^task$/i }));
    const resortedRows = within(screen.getByRole('table')).getAllByRole('row').slice(2);
    expect(resortedRows[0]).toHaveTextContent('Send recap');
  });

  it('opens the add form with Ctrl+N and submits a new task', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.keyboard('{Control>}n{/Control}');
    await user.type(screen.getByLabelText('Task'), 'Call customer');
    await user.selectOptions(screen.getByLabelText('Customer'), '2');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(createMutate).toHaveBeenCalledWith(
      {
        title: 'Call customer',
        due_date: null,
        organization_id: 2,
        status: 'open',
      },
      expect.any(Object),
    );
  });
});
