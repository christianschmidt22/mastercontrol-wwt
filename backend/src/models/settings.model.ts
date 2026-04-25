import { db } from '../db/database.js';

interface SettingRow {
  key: string;
  value: string;
}

const getStmt = db.prepare<[string], SettingRow>('SELECT key, value FROM settings WHERE key = ?');
const upsertStmt = db.prepare<[string, string]>(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
);

export const settingsModel = {
  get: (key: string): string | null => getStmt.get(key)?.value ?? null,
  set: (key: string, value: string): void => {
    upsertStmt.run(key, value);
  },
};
