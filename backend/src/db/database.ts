import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// When DB_PATH=':memory:', skip filesystem path resolution entirely.
// better-sqlite3 opens an in-process memory database for the ':memory:' literal.
const rawPath = process.env.DB_PATH;
const DB_PATH: string =
  rawPath === ':memory:' ? ':memory:' : (rawPath ?? join(__dirname, '../../../database/mastercontrol.db'));

const MIGRATIONS_DIR = join(__dirname, 'migrations');

if (DB_PATH !== ':memory:') {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}

export const db = new Database(DB_PATH);

// WAL mode is unsupported on in-memory databases; skip it to avoid confusion.
if (DB_PATH !== ':memory:') {
  db.pragma('journal_mode = WAL');
}
db.pragma('foreign_keys = ON');

/**
 * Apply any pending numbered SQL migrations from `migrations/`.
 * Each file is `NNN_*.sql`; the numeric prefix is the migration id.
 * The `_migrations` table itself uses CREATE IF NOT EXISTS — it's the
 * bootstrap anchor. Every other migration runs once inside a transaction.
 */
export function runMigrations(): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       id         INTEGER PRIMARY KEY,
       name       TEXT    NOT NULL,
       applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
     )`,
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  const applied = new Set<number>(
    db.prepare('SELECT id FROM _migrations').all().map((r) => (r as { id: number }).id),
  );
  const insertRow = db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)');

  for (const file of files) {
    const id = Number.parseInt(file.split('_', 1)[0], 10);
    if (applied.has(id)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      insertRow.run(id, file);
    })();
  }
}

// Backwards-compatible alias for callers still using the Phase 1 name.
export const initSchema = runMigrations;

// IMPORTANT: ESM static imports are hoisted, so any model file imported
// alongside this one will run its `db.prepare(...)` calls before any other
// top-level code in the consuming module gets a chance to call runMigrations().
// To guarantee the schema exists by the time the model files prepare their
// statements, we run runMigrations() right here at module-load — making the
// singleton "ready to use" the moment any consumer touches `db`.
runMigrations();
