import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectNextStepsTile } from './ProjectNextStepsTile';
import type { Task } from '../../../types';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const openTask: Task = {
  id: 7,
  organization_id: 2,
  contact_id: null,
  project_id: 14,
  title: 'Schedule pricing and design review',
  due_date: '2026-05-01',
  status: 'open',
  created_at: '2026-04-29 00:35:23',
  completed_at: null,
};

const doneTask: Task = {
  ...openTask,
  id: 8,
  title: 'Send prep notes to Maya',
  status: 'done',
  completed_at: '2026-04-29 00:36:14',
};

function makeMutations() {
  return {
    complete: vi.fn(),
    reopen: vi.fn(),
    create: vi.fn(),
    isCreating: false,
  };
}

describe('ProjectNextStepsTile', () => {
  it('keeps completed next steps visible with a reopen action', async () => {
    const user = userEvent.setup();
    const mutations = makeMutations();

    renderWithClient(
      <ProjectNextStepsTile
        projectId={14}
        orgId={2}
        _useTasks={() => ({ data: [openTask, doneTask], isLoading: false })}
        _useTaskMutations={() => mutations}
      />,
    );

    expect(screen.getByText('Schedule pricing and design review')).toBeInTheDocument();
    expect(screen.getByText('Send prep notes to Maya')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mark complete/i }));
    expect(mutations.complete).toHaveBeenCalledWith(7);

    await user.click(screen.getByRole('button', { name: /reopen: send prep notes/i }));
    expect(mutations.reopen).toHaveBeenCalledWith(8);
  });
});
