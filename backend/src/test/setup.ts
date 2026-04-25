// Set DB_PATH before database.ts is evaluated. With ESM, static imports are
// hoisted, so we use dynamic import below to guarantee ordering.
// '??=' lets an explicit CI override win over the default.
process.env['DB_PATH'] ??= ':memory:';

import { beforeAll, beforeEach, afterEach } from 'vitest';

// Dynamic imports guarantee that database.ts module evaluation (which opens
// the SQLite connection at import time) happens only after the env var above
// is in place. This is the correct pattern for ESM singletons that read
// process.env at module load time.
const { db, initSchema } = await import('../db/database.js');

// Run schema DDL once per test-process (each file in pool:forks gets its own
// process). CREATE IF NOT EXISTS makes this idempotent.
beforeAll(() => {
  initSchema();
});

// Wrap every test in a savepoint so any writes are rolled back automatically.
// This is faster than recreating the DB per test and keeps tests independent.
beforeEach(() => {
  db.exec('SAVEPOINT t');
});

afterEach(() => {
  db.exec('ROLLBACK TO SAVEPOINT t');
  db.exec('RELEASE SAVEPOINT t');
});
