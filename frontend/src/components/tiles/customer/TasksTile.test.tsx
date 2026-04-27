/**
 * TasksTile.test.tsx
 *
 * Tests for the TasksTile empty-state and data-view rendering.
 * Hook injection via the _useTasks prop — no real network calls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TasksTile } from './TasksTile';
import type { Task } from '../../../types';

const openTask: Task = {
  id: 1,
  organization_id: 10,
  contact_id: null,
  title: 'Send renewal quote',
  due_date: '2026-12-31',
  status: 'open',
  created_at: '2026-01-01T00:00:00Z',
  completed_at: null,
};

function makeTaskHook(data: Task[] | undefined, isLoading = false) {
  return (_params: { orgId: number; status: string }) => ({ data, isLoading });
}

function makeTaskMutations() {
  return () => ({
    complete: (_id: number) => {},
    create: (_title: string, _orgId: number) => {},
  });
}

describe('TasksTile — empty state', () => {
  it('shows empty-state copy when task list is empty', () => {
    render(
      <TasksTile
        orgId={10}
        _useTasks={makeTaskHook([])}
        _useTaskMutations={makeTaskMutations()}
      />,
    );
    expect(screen.getByText('Nothing due today.')).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(
      <TasksTile
        orgId={10}
        _useTasks={makeTaskHook([])}
        _useTaskMutations={makeTaskMutations()}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show empty state while loading', () => {
    render(
      <TasksTile
        orgId={10}
        _useTasks={makeTaskHook(undefined, true)}
        _useTaskMutations={makeTaskMutations()}
      />,
    );
    expect(screen.queryByText('Nothing due today.')).toBeNull();
  });
});

describe('TasksTile — data view', () => {
  it('renders task title when data is present', () => {
    render(
      <TasksTile
        orgId={10}
        _useTasks={makeTaskHook([openTask])}
        _useTaskMutations={makeTaskMutations()}
      />,
    );
    expect(screen.getByText('Send renewal quote')).toBeInTheDocument();
  });

  it('does not render empty state when tasks exist', () => {
    render(
      <TasksTile
        orgId={10}
        _useTasks={makeTaskHook([openTask])}
        _useTaskMutations={makeTaskMutations()}
      />,
    );
    expect(screen.queryByText('Nothing due today.')).toBeNull();
  });
});
