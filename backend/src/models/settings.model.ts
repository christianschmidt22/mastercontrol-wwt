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

/**
 * R-003: keys whose values are secrets and must never reach the frontend.
 * Two getters exist: `get(key)` returns plaintext (callable only from
 * `claude.service.ts` and other backend-only consumers); `getMasked(key)`
 * returns `***last4` for any key in this set and is what every route handler
 * uses for `GET /api/settings/:key`.
 *
 * The encrypt/decrypt hooks below are stubs until the DPAPI dep lands
 * (R-003 implementation in plan step 8). Until then, secrets are stored
 * plaintext but already routed through this single chokepoint, so the
 * encryption upgrade is a 10-line change to `encrypt`/`decrypt` rather
 * than a refactor of every caller.
 */
export const SECRET_KEYS: ReadonlySet<string> = new Set([
  'anthropic_api_key',
]);

const ENC_PREFIX = 'enc:';

/**
 * R-003: encrypt-on-write. Until DPAPI is wired (`@primno/dpapi` or
 * `node-dpapi`), this is a pass-through. When DPAPI lands, replace the body
 * with `'enc:' + base64(CryptProtectData(Buffer.from(plain, 'utf8')))`.
 */
function encrypt(plain: string): string {
  // TODO(R-003): wire DPAPI.
  return plain;
}

/**
 * R-003: decrypt-on-read. Recognizes the `enc:` prefix; legacy/plaintext
 * values still read through during the transition. After DPAPI lands, any
 * value without the prefix is treated as legacy plaintext and re-encrypted
 * on next write.
 */
function decrypt(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  // TODO(R-003): wire DPAPI.
  return stored.slice(ENC_PREFIX.length);
}

function mask(plain: string): string {
  if (plain.length <= 4) return '***';
  return `***${plain.slice(-4)}`;
}

export const settingsModel = {
  /**
   * Plaintext getter. Backend-only — never expose the result to the frontend.
   * Callers: `claude.service.ts` for the Anthropic API key and any other
   * service-layer consumer.
   */
  get: (key: string): string | null => {
    const row = getStmt.get(key);
    return row ? decrypt(row.value) : null;
  },

  /**
   * Frontend-safe getter. Returns the raw value for non-secret keys and a
   * masked form (`***last4`) for any key in `SECRET_KEYS`. This is what
   * route handlers use for `GET /api/settings/:key`.
   */
  getMasked: (key: string): string | null => {
    const row = getStmt.get(key);
    if (!row) return null;
    const plain = decrypt(row.value);
    return SECRET_KEYS.has(key) ? mask(plain) : plain;
  },

  /**
   * Single chokepoint for writes. Secret keys are encrypted on the way in.
   */
  set: (key: string, value: string): void => {
    const stored = SECRET_KEYS.has(key) ? `${ENC_PREFIX}${encrypt(value)}` : value;
    upsertStmt.run(key, stored);
  },
};
