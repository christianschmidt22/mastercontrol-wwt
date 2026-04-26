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
 */
export const SECRET_KEYS: ReadonlySet<string> = new Set([
  'anthropic_api_key',
  // R-003: personal subscription key for /api/subagent/delegate. Stored
  // separately from the per-org-chat key so the user can use a different
  // billing account for ad-hoc subagent tasks.
  'personal_anthropic_api_key',
]);

const ENC_PREFIX = 'enc:';

// ---------------------------------------------------------------------------
// R-003: DPAPI integration — platform-adaptive
//
// On Windows: @primno/dpapi binds to CryptProtectData / CryptUnprotectData
// via N-API. We do a one-time dynamic import so the module is never
// required on non-Windows hosts (CI, macOS dev boxes) where the native addon
// would fail to compile or load.
//
// On non-Windows (or if the import fails for any reason): fall back to a
// no-op transform so tests and CI always pass. A warning is emitted ONCE
// to stderr so the operator knows encryption is inactive.
// ---------------------------------------------------------------------------

type DpapiModule = {
  protectData(data: Buffer, entropy: Buffer | null, scope: 'CurrentUser' | 'LocalMachine'): Buffer;
  unprotectData(data: Buffer, entropy: Buffer | null, scope: 'CurrentUser' | 'LocalMachine'): Buffer;
};

// Resolved on first use; null = no-op fallback.
let _dpapi: DpapiModule | null | undefined = undefined; // undefined = not yet resolved
let _warnedOnce = false;

async function getDpapi(): Promise<DpapiModule | null> {
  if (_dpapi !== undefined) return _dpapi;

  if (process.platform !== 'win32') {
    if (!_warnedOnce) {
      console.warn(
        '[settings.model] DPAPI unavailable (non-Windows platform). ' +
          'anthropic_api_key will be stored without encryption. ' +
          'This is expected in CI / non-Windows dev environments.'
      );
      _warnedOnce = true;
    }
    _dpapi = null;
    return null;
  }

  try {
    // Dynamic import keeps the native module out of the module graph on
    // non-Windows. @primno/dpapi exports named functions `protectData` and
    // `unprotectData`. We wrap the named exports into the DpapiModule shape.
    const mod = await import('@primno/dpapi');
    // Cast through unknown — the SDK's Buffer<ArrayBufferLike> generic shape
    // doesn't match our nominally-typed DpapiModule literally, but the runtime
    // call shape is identical (protectData/unprotectData with the same args).
    const { protectData, unprotectData } = mod as unknown as {
      protectData: DpapiModule['protectData'];
      unprotectData: DpapiModule['unprotectData'];
    };
    _dpapi = { protectData, unprotectData };
    return _dpapi;
  } catch (err) {
    if (!_warnedOnce) {
      console.warn(
        '[settings.model] Failed to load @primno/dpapi — falling back to no-op encryption. ' +
          `Error: ${err instanceof Error ? err.message : String(err)}`
      );
      _warnedOnce = true;
    }
    _dpapi = null;
    return null;
  }
}

/**
 * R-003: Synchronous encrypt/decrypt used at the call sites.
 *
 * Because better-sqlite3 is synchronous and the model API is synchronous, we
 * cannot await getDpapi() at call sites. Instead we expose a synchronous
 * variant that uses the already-resolved _dpapi value (or no-op if not yet
 * resolved / unavailable). Callers must warm the DPAPI module on startup by
 * calling `warmDpapi()` before the first write; after that the in-process
 * reference is stable.
 *
 * `warmDpapi` is exported so the backend entrypoint can call it at boot to
 * preload the native module before the first request arrives.
 */
export async function warmDpapi(): Promise<void> {
  await getDpapi();
}

/**
 * Synchronous encrypt — returns `enc:<base64>` on Windows with DPAPI,
 * or the plaintext unchanged on non-Windows (no-op fallback).
 *
 * Called only after warmDpapi() has resolved; if _dpapi is still undefined
 * we treat it as null (no-op) rather than throwing.
 */
function encryptSync(plain: string): string {
  const dpapi = _dpapi ?? null;
  if (!dpapi) return plain;
  const encrypted = dpapi.protectData(Buffer.from(plain, 'utf8'), null, 'CurrentUser');
  return encrypted.toString('base64');
}

/**
 * Synchronous decrypt — strips `enc:` prefix and reverses DPAPI encryption
 * on Windows. Legacy plaintext values (no `enc:` prefix) pass through
 * unchanged so old rows continue to work until re-written.
 */
function decryptSync(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) {
    // Legacy plaintext — stored before DPAPI was wired, or on non-Windows.
    return stored;
  }
  const b64 = stored.slice(ENC_PREFIX.length);
  const dpapi = _dpapi ?? null;
  if (!dpapi) {
    // No-op path: can't decrypt a real DPAPI blob here, but this only
    // happens on non-Windows where no DPAPI blobs should exist. Return
    // the raw base64 so the caller gets something rather than crashing.
    return b64;
  }
  const buf = Buffer.from(b64, 'base64');
  return dpapi.unprotectData(buf, null, 'CurrentUser').toString('utf8');
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
    return row ? decryptSync(row.value) : null;
  },

  /**
   * Frontend-safe getter. Returns the raw value for non-secret keys and a
   * masked form (`***last4`) for any key in `SECRET_KEYS`. This is what
   * route handlers use for `GET /api/settings/:key`.
   */
  getMasked: (key: string): string | null => {
    const row = getStmt.get(key);
    if (!row) return null;
    const plain = decryptSync(row.value);
    return SECRET_KEYS.has(key) ? mask(plain) : plain;
  },

  /**
   * Single chokepoint for writes. Secret keys are DPAPI-encrypted on the
   * way in, stored as `enc:<base64(ciphertext)>` on Windows or
   * `enc:<plaintext>` on non-Windows (no-op fallback). The `enc:` prefix is
   * always written for secret keys so decrypt-on-read can detect both legacy
   * unencrypted rows (no prefix) and current rows (prefix present).
   */
  set: (key: string, value: string): void => {
    // encryptSync returns a DPAPI base64 blob on Windows, or the plaintext
    // unchanged on non-Windows (no-op). Either way we prefix with ENC_PREFIX.
    const stored = SECRET_KEYS.has(key)
      ? ENC_PREFIX + encryptSync(value)
      : value;
    upsertStmt.run(key, stored);
  },

  /**
   * Delete a setting. Used by the tile-dashboard "Reset to default" flow,
   * which clears `layout.customer` / `layout.oem` so the in-code default
   * layout takes over again. Returns true if a row was deleted.
   */
  remove: (key: string): boolean => {
    const result = db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    return result.changes > 0;
  },
};
