/**
 * migrations.test.ts
 *
 * Verifies the migration runner contract:
 *   (a) all 6 numbered migrations are recorded in _migrations after the
 *       initial run (driven by setup.ts at module load).
 *   (b) calling runMigrations() again is idempotent — no duplicate rows,
 *       no errors.
 *   (c) the index added in 002_indexes.sql is actually used by the
 *       thread-history read pattern.
 *   (d) the cross-org task trigger from 003_schema_harden.sql rejects a
 *       task whose contact belongs to a different org.
 *   (e) the UNIQUE(schedule_id, fire_time) constraint from 006_reports.sql
 *       rejects a duplicate report_runs insert.
 */

import { describe, it, expect } from 'vitest';
import { db, runMigrations } from './database.js';
import { makeOrg, makeContact } from '../test/factories.js';

// ---------------------------------------------------------------------------
// (a) all 6 rows in _migrations after first run
// ---------------------------------------------------------------------------

describe('runMigrations — initial apply', () => {
  it('records every numbered migration in _migrations in sequence', () => {
    const rows = db.prepare('SELECT id, name FROM _migrations ORDER BY id').all() as Array<{
      id: number;
      name: string;
    }>;

    // Sequence is 1..N with N = current count. Adding new migrations bumps
    // the count without breaking this assertion.
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.map((r) => r.id)).toEqual(rows.map((_, i) => i + 1));
    expect(rows[0].name).toMatch(/^001_/);
  });
});

// ---------------------------------------------------------------------------
// (b) re-running runMigrations is idempotent
// ---------------------------------------------------------------------------

describe('runMigrations — idempotency', () => {
  it('a second call leaves _migrations unchanged and throws no errors', () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM _migrations').get() as { n: number };
    const startCount = before.n;
    expect(startCount).toBeGreaterThanOrEqual(6);

    expect(() => runMigrations()).not.toThrow();

    const after = db.prepare('SELECT COUNT(*) AS n FROM _migrations').get() as { n: number };
    expect(after.n).toBe(startCount);
  });
});

// ---------------------------------------------------------------------------
// (c) idx_notes_thread_created is used by the thread-history read
// ---------------------------------------------------------------------------

describe('002_indexes.sql — idx_notes_thread_created', () => {
  it('EXPLAIN QUERY PLAN for thread-history read mentions the index', () => {
    const plan = db
      .prepare(
        'EXPLAIN QUERY PLAN SELECT * FROM notes WHERE thread_id = ? ORDER BY created_at',
      )
      .all(1) as Array<{ detail: string }>;

    const text = plan.map((r) => r.detail).join('\n');
    expect(text).toContain('idx_notes_thread_created');
  });
});

// ---------------------------------------------------------------------------
// (d) cross-org task trigger from 003_schema_harden.sql
// ---------------------------------------------------------------------------

describe('003_schema_harden.sql — cross-org task trigger', () => {
  it('rejects a task whose contact belongs to a different org', () => {
    const orgA = makeOrg({ type: 'customer', name: 'Org A (task target)' });
    const orgB = makeOrg({ type: 'customer', name: 'Org B (contact home)' });
    const contactInB = makeContact(orgB.id, { name: 'Contact in B' });

    const stmt = db.prepare(
      `INSERT INTO tasks (organization_id, contact_id, title)
       VALUES (?, ?, ?)`,
    );

    expect(() => stmt.run(orgA.id, contactInB.id, 'cross-org task')).toThrow(
      /contact org mismatch|SQLITE_CONSTRAINT/,
    );
  });
});

// ---------------------------------------------------------------------------
// (e) UNIQUE(schedule_id, fire_time) on report_runs from 006_reports.sql
// ---------------------------------------------------------------------------

describe('006_reports.sql — UNIQUE(schedule_id, fire_time)', () => {
  it('rejects a second report_runs insert with the same (schedule_id, fire_time)', () => {
    // Seed a report + schedule so report_runs has a valid FK target.
    const reportId = (
      db
        .prepare(
          `INSERT INTO reports (name, prompt_template) VALUES (?, ?) RETURNING id`,
        )
        .get('Test Report', 'template body') as { id: number }
    ).id;

    const scheduleId = (
      db
        .prepare(
          `INSERT INTO report_schedules (report_id, cron_expr) VALUES (?, ?) RETURNING id`,
        )
        .get(reportId, '0 7 * * *') as { id: number }
    ).id;

    const insertRun = db.prepare(
      `INSERT INTO report_runs (schedule_id, fire_time) VALUES (?, ?)`,
    );

    insertRun.run(scheduleId, 1700000000);

    expect(() => insertRun.run(scheduleId, 1700000000)).toThrow(/UNIQUE constraint failed|SQLITE_CONSTRAINT/);
  });
});
