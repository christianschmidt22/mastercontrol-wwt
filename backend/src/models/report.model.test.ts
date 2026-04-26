/**
 * report.model.test.ts — Phase 2 / Step 5a.
 *
 * Covers list / get / create / update / remove and the JSON serialisation
 * of the `target` column (number[] vs ["all"]).
 */

// Bootstrap reports tables BEFORE the model imports its prepared statements.
import '../test/reportsSchema.js';

import { describe, it, expect } from 'vitest';
import { reportModel } from './report.model.js';

describe('reportModel.create', () => {
  it('persists a report with default target=["all"] and output_format=markdown', () => {
    const r = reportModel.create({
      name: 'Test Report A',
      prompt_template: 'Hello {{date}}',
    });

    expect(r.id).toBeTypeOf('number');
    expect(r.name).toBe('Test Report A');
    expect(r.prompt_template).toBe('Hello {{date}}');
    expect(r.target).toEqual(['all']);
    expect(r.output_format).toBe('markdown');
    expect(r.enabled).toBe(true);
    expect(r.created_at).toBeTypeOf('string');
  });

  it('round-trips a numeric target through JSON', () => {
    const r = reportModel.create({
      name: 'Specific Org Report',
      prompt_template: 't',
      target: [3, 7, 11],
    });
    expect(r.target).toEqual([3, 7, 11]);
  });

  it('respects enabled=false on create', () => {
    const r = reportModel.create({
      name: 'Disabled report',
      prompt_template: 't',
      enabled: false,
    });
    expect(r.enabled).toBe(false);
  });
});

describe('reportModel.get', () => {
  it('returns the same shape as create', () => {
    const created = reportModel.create({
      name: 'Get test',
      prompt_template: 'hi',
      target: [1, 2],
    });
    const fetched = reportModel.get(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.target).toEqual([1, 2]);
  });

  it('returns undefined for an unknown id', () => {
    expect(reportModel.get(9_999_999)).toBeUndefined();
  });
});

describe('reportModel.list', () => {
  it('returns an array containing newly created reports', () => {
    const created = reportModel.create({
      name: 'List test',
      prompt_template: 'hi',
    });
    const all = reportModel.list();
    expect(all.some((r) => r.id === created.id && r.name === 'List test')).toBe(
      true,
    );
  });
});

describe('reportModel.update', () => {
  it('updates name and target while leaving other fields intact', () => {
    const created = reportModel.create({
      name: 'Original name',
      prompt_template: 'orig',
      target: ['all'],
    });

    const updated = reportModel.update(created.id, {
      name: 'New name',
      target: [42],
    });

    expect(updated).toBeDefined();
    expect(updated!.name).toBe('New name');
    expect(updated!.target).toEqual([42]);
    expect(updated!.prompt_template).toBe('orig');
    expect(updated!.enabled).toBe(true);
  });

  it('flips enabled false when patch sets it', () => {
    const created = reportModel.create({
      name: 'Toggle',
      prompt_template: 't',
    });
    const updated = reportModel.update(created.id, { enabled: false });
    expect(updated!.enabled).toBe(false);
  });

  it('returns undefined when the row does not exist', () => {
    expect(reportModel.update(9_999_999, { name: 'x' })).toBeUndefined();
  });
});

describe('reportModel.remove', () => {
  it('deletes the row and returns true', () => {
    const created = reportModel.create({
      name: 'Doomed',
      prompt_template: 't',
    });
    expect(reportModel.remove(created.id)).toBe(true);
    expect(reportModel.get(created.id)).toBeUndefined();
  });

  it('returns false for an unknown id', () => {
    expect(reportModel.remove(9_999_999)).toBe(false);
  });
});
