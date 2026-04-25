// Set DB_PATH before database.ts is evaluated. With ESM, static imports are
// hoisted, so we use dynamic import below to guarantee ordering.
// '??=' lets an explicit CI override win over the default.
process.env['DB_PATH'] ??= ':memory:';

import { beforeEach, afterEach } from 'vitest';

// Dynamic import + IMMEDIATE initSchema() — has to run BEFORE the test files
// import their models. Each model file does `db.prepare('SELECT * FROM …')`
// at module load time; if the schema isn't already in place by then, the
// prepare throws "no such table: …".
//
// `beforeAll(initSchema)` would run too late: vitest evaluates this setup
// file synchronously, then loads the test file, and the test file's static
// imports of model files run BEFORE any beforeAll callback fires. So the
// schema must exist by the time this top-level await returns.
const { db, initSchema } = await import('../db/database.js');
initSchema();

// Wrap every test in a savepoint so any writes are rolled back automatically.
// This is faster than recreating the DB per test and keeps tests independent.
beforeEach(() => {
  db.exec('SAVEPOINT t');
});

afterEach(() => {
  db.exec('ROLLBACK TO SAVEPOINT t');
  db.exec('RELEASE SAVEPOINT t');
});
