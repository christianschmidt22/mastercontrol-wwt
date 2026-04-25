import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// When DB_PATH=':memory:', skip filesystem path resolution entirely.
// better-sqlite3 opens an in-process memory database for the ':memory:' literal.
const rawPath = process.env.DB_PATH;
const DB_PATH: string =
  rawPath === ':memory:' ? ':memory:' : (rawPath ?? join(__dirname, '../../../database/mastercontrol.db'));

const SCHEMA_PATH = join(__dirname, 'schema.sql');

export const db = new Database(DB_PATH);

// WAL mode is unsupported on in-memory databases; skip it to avoid confusion.
if (DB_PATH !== ':memory:') {
  db.pragma('journal_mode = WAL');
}
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  // All DDL uses CREATE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS so this
  // is safe to call multiple times (idempotent on a fresh in-memory db too).
  db.exec(schema);
}
