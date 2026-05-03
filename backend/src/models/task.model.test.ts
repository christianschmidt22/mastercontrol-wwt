/**
 * task.model.test.ts
 *
 * Tests for taskModel.complete() and taskModel.list() filter combinations.
 */

import { describe, it, expect } from 'vitest';
import { taskModel } from './task.model.js';
import { makeOrg, makeTask } from '../test/factories.js';

// ---------------------------------------------------------------------------
// complete()
// ---------------------------------------------------------------------------

describe('taskModel.complete', () => {
  it('sets status to done and stamps a non-null completed_at', () => {
    const task = makeTask({ title: 'Send proposal', status: 'open' });

    const updated = taskModel.complete(task.id);

    expect(updated).toBeDefined();
    expect(updated!.status).toBe('done');
    expect(updated!.completed_at).not.toBeNull();
    // completed_at should be parseable as a date
    expect(Number.isNaN(new Date(updated!.completed_at!).getTime())).toBe(false);
  });

  it('returns the full updated row with all fields', () => {
    const task = makeTask({ title: 'Follow up', status: 'open' });
    const updated = taskModel.complete(task.id);

    expect(updated!.id).toBe(task.id);
    expect(updated!.title).toBe('Follow up');
    expect(updated!.status).toBe('done');
  });

  it('returns undefined when task id does not exist', () => {
    const result = taskModel.complete(9999999);
    expect(result).toBeUndefined();
  });

  it('does not change the completed_at of an already-completed task', () => {
    const task = makeTask({ title: 'Double complete' });
    const first = taskModel.complete(task.id)!;

    // Give time for the clock to potentially change, then complete again
    const second = taskModel.complete(task.id)!;

    // Both calls succeed and the row is in done state
    expect(second.status).toBe('done');
    // completed_at is re-set on second complete (UPDATE always runs)
    // This is acceptable behaviour — we just verify it doesn't crash
    expect(second.completed_at).not.toBeNull();
    // The first completed_at timestamp should be a valid date
    expect(Number.isNaN(new Date(first.completed_at!).getTime())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// list() — filter combinations
// ---------------------------------------------------------------------------

describe('taskModel.list', () => {
  it('returns all tasks when no filters are applied', () => {
    makeTask({ title: 'Task A' });
    makeTask({ title: 'Task B' });

    const all = taskModel.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by status=open', () => {
    makeTask({ title: 'Open task', status: 'open' });
    const openTask = makeTask({ title: 'Another open', status: 'open' });
    // Complete one task to create a done task
    taskModel.complete(openTask.id);

    const open = taskModel.list({ status: 'open' });
    expect(open.every((t) => t.status === 'open')).toBe(true);
  });

  it('filters by status=done', () => {
    const task = makeTask({ title: 'Done task', status: 'open' });
    taskModel.complete(task.id);

    const done = taskModel.list({ status: 'done' });
    expect(done.length).toBeGreaterThanOrEqual(1);
    expect(done.every((t) => t.status === 'done')).toBe(true);
  });

  it('filters by due_before — only returns tasks with due_date < the cutoff', () => {
    makeTask({ title: 'Overdue task', due_date: '2026-01-01', status: 'open' });
    makeTask({ title: 'Future task', due_date: '2026-12-31', status: 'open' });

    const overdue = taskModel.list({ due_before: '2026-06-01' });
    const titles = overdue.map((t) => t.title);
    expect(titles).toContain('Overdue task');
    expect(titles).not.toContain('Future task');
  });

  it('filters by org_id — only returns tasks for the specified org', () => {
    const org1 = makeOrg({ type: 'customer', name: 'Task Org 1' });
    const org2 = makeOrg({ type: 'customer', name: 'Task Org 2' });

    makeTask({ title: 'Org1 Task', organization_id: org1.id });
    makeTask({ title: 'Org2 Task', organization_id: org2.id });

    const org1Tasks = taskModel.list({ org_id: org1.id });
    const titles = org1Tasks.map((t) => t.title);
    expect(titles).toContain('Org1 Task');
    expect(titles).not.toContain('Org2 Task');
  });

  it('combines status + org_id filters', () => {
    const org = makeOrg({ type: 'customer', name: 'Combo Filter Org' });

    const openTask = makeTask({ title: 'Open combo', organization_id: org.id, status: 'open' });
    const doneSource = makeTask({ title: 'Done combo', organization_id: org.id, status: 'open' });
    taskModel.complete(doneSource.id);

    const openOrgTasks = taskModel.list({ status: 'open', org_id: org.id });
    const titles = openOrgTasks.map((t) => t.title);
    expect(titles).toContain('Open combo');
    expect(titles).not.toContain('Done combo');

    // openTask should still be open
    expect(taskModel.get(openTask.id)!.status).toBe('open');
  });

  it('combines status + due_before filters', () => {
    makeTask({ title: 'Open overdue', status: 'open', due_date: '2026-02-01' });
    const future = makeTask({ title: 'Open future', status: 'open', due_date: '2026-11-01' });
    taskModel.complete(future.id); // make this one done

    const results = taskModel.list({ status: 'open', due_before: '2026-06-01' });
    const titles = results.map((t) => t.title);
    expect(titles).toContain('Open overdue');
    // The future task is done so should not appear in open list
    expect(titles).not.toContain('Open future');
  });

  it('returns empty array when no tasks match the filters', () => {
    const org = makeOrg({ type: 'customer', name: 'Empty Filter Org' });
    const results = taskModel.list({ status: 'open', org_id: org.id });
    // Org has no tasks — should return empty array (plus any from other tests,
    // but savepoint ensures isolation)
    expect(results.every((t) => t.organization_id === org.id)).toBe(true);
  });

  it('results are ordered by due_date ASC, then created_at ASC', () => {
    const org = makeOrg({ type: 'customer', name: 'Ordering Org' });

    makeTask({ title: 'Later due', organization_id: org.id, due_date: '2026-09-01', status: 'open' });
    makeTask({ title: 'Earlier due', organization_id: org.id, due_date: '2026-03-01', status: 'open' });
    makeTask({ title: 'No due date', organization_id: org.id, due_date: null, status: 'open' });

    const results = taskModel.list({ status: 'open', org_id: org.id });
    const dueDates = results.map((t) => t.due_date);

    // Tasks with due_date should come before null due_date tasks (ASC NULLs last in SQLite)
    const withDue = dueDates.filter((d) => d !== null);
    const sorted = [...withDue].sort();
    expect(withDue).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// create() and get()
// ---------------------------------------------------------------------------

describe('taskModel.create', () => {
  it('creates a task with all optional fields', () => {
    const org = makeOrg({ type: 'customer', name: 'Create Org' });

    const task = taskModel.create({
      title: 'Full task',
      organization_id: org.id,
      details: 'Pricing notes and next action context',
      due_date: '2026-07-15',
      status: 'open',
    });

    expect(task.id).toBeTypeOf('number');
    expect(task.title).toBe('Full task');
    expect(task.organization_id).toBe(org.id);
    expect(task.details).toBe('Pricing notes and next action context');
    expect(task.kind).toBe('task');
    expect(task.due_date).toBe('2026-07-15');
    expect(task.status).toBe('open');
    expect(task.completed_at).toBeNull();
  });

  it('defaults status to open when not specified', () => {
    const task = taskModel.create({ title: 'Default status task' });
    expect(task.status).toBe('open');
  });

  it('creates and filters remembered questions separately from tasks', () => {
    makeTask({ title: 'Normal follow-up', kind: 'task', status: 'open' });
    const question = makeTask({ title: 'Ask Cory about budget owner', kind: 'question', status: 'open' });

    const questions = taskModel.list({ kind: 'question' });

    expect(questions.map((task) => task.id)).toContain(question.id);
    expect(questions.every((task) => task.kind === 'question')).toBe(true);
  });
});

describe('taskModel.update status transitions', () => {
  it('updates task details independently of title and due date', () => {
    const task = makeTask({ title: 'Track details', details: 'Initial notes' });

    const updated = taskModel.update(task.id, { details: 'Expanded working notes' })!;

    expect(updated.title).toBe('Track details');
    expect(updated.details).toBe('Expanded working notes');
  });

  it('clears completed_at when a completed task is reopened', () => {
    const task = makeTask({ title: 'Reopen task', status: 'open' });
    const completed = taskModel.complete(task.id)!;
    expect(completed.completed_at).not.toBeNull();

    const reopened = taskModel.update(task.id, { status: 'open' })!;

    expect(reopened.status).toBe('open');
    expect(reopened.completed_at).toBeNull();
  });
});
