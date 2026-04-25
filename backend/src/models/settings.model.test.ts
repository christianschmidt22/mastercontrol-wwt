/**
 * settings.model.test.ts
 *
 * R-003 platform-adaptive tests.
 *
 * On Windows with @primno/dpapi available:
 *   - Secret keys are stored as `enc:<base64(DPAPI ciphertext)>`.
 *   - The ciphertext is not the same as the plaintext.
 *   - get() returns the original plaintext (round-trip works).
 *
 * On non-Windows (CI, macOS dev) or when DPAPI import fails:
 *   - warmDpapi() sets _dpapi = null (no-op fallback).
 *   - Secret keys are stored as `enc:<plaintext>` (prefix present, value readable).
 *   - get() still returns the original plaintext (round-trip works).
 *
 * All tests run on both platforms — no skips.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db/database.js';
import { settingsModel, warmDpapi } from './settings.model.js';

// Warm the DPAPI module before any test so the synchronous encrypt/decrypt
// path uses the resolved _dpapi reference. In CI (non-Windows) this sets
// _dpapi = null and logs a one-time warning.
beforeAll(async () => {
  await warmDpapi();
});

describe('settingsModel — non-secret round-trip', () => {
  it('set + get returns the stored value for a non-secret key', () => {
    settingsModel.set('default_model', 'claude-sonnet-4-6');
    expect(settingsModel.get('default_model')).toBe('claude-sonnet-4-6');
  });

  it('returns null for a key that has never been set', () => {
    expect(settingsModel.get('nonexistent_key_xyz')).toBeNull();
  });

  it('upserts correctly — second set overwrites first', () => {
    settingsModel.set('ui.theme', 'light');
    settingsModel.set('ui.theme', 'dark');
    expect(settingsModel.get('ui.theme')).toBe('dark');
  });

  it('non-secret values are stored as-is (no enc: prefix)', () => {
    settingsModel.set('workvault_root', 'C:\\Users\\test\\WorkVault');
    const row = db
      .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
      .get('workvault_root');
    expect(row).toBeDefined();
    expect(row!.value).toBe('C:\\Users\\test\\WorkVault');
    expect(row!.value.startsWith('enc:')).toBe(false);
  });
});

describe('settingsModel — anthropic_api_key DPAPI / no-op encryption (R-003)', () => {
  it('stores the raw DB value with an enc: prefix for anthropic_api_key', () => {
    // On all platforms the stored value must have the enc: prefix.
    // On Windows: enc:<base64(DPAPI ciphertext)>
    // On non-Windows (no-op): enc:<plaintext>
    const secret = 'sk-ant-test1234';
    settingsModel.set('anthropic_api_key', secret);

    const row = db
      .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
      .get('anthropic_api_key');
    expect(row).toBeDefined();
    expect(row!.value.startsWith('enc:')).toBe(true);
  });

  it('get(anthropic_api_key) returns plaintext on all platforms (round-trip)', () => {
    const secret = 'sk-ant-abcd5678';
    settingsModel.set('anthropic_api_key', secret);
    expect(settingsModel.get('anthropic_api_key')).toBe(secret);
  });

  it('on Windows: stored value after the enc: prefix is NOT the plaintext (real encryption)', () => {
    if (process.platform !== 'win32') {
      // Non-Windows: no-op path stores plaintext after the prefix — skip
      // this directional assertion and verify the inverse instead.
      const secret = 'sk-ant-noop-test';
      settingsModel.set('anthropic_api_key', secret);
      const row = db
        .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
        .get('anthropic_api_key');
      // On non-Windows the value after the prefix IS the plaintext (no-op).
      expect(row!.value).toBe('enc:' + secret);
      return;
    }
    // Windows with DPAPI: the base64 after enc: must differ from the plaintext.
    const secret = 'sk-ant-windows-test';
    settingsModel.set('anthropic_api_key', secret);
    const row = db
      .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
      .get('anthropic_api_key');
    const afterPrefix = row!.value.slice('enc:'.length);
    // The DPAPI ciphertext (as base64) is never the same as the original string.
    expect(afterPrefix).not.toBe(secret);
    // It must be valid base64 (only base64 chars).
    expect(afterPrefix).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('legacy plaintext rows (no enc: prefix) still decrypt correctly', () => {
    // Simulate a row written before DPAPI was wired — stored without enc: prefix.
    const legacy = 'sk-ant-legacy-key';
    db.prepare<[string, string]>(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run('anthropic_api_key', legacy);

    expect(settingsModel.get('anthropic_api_key')).toBe(legacy);
  });

  it('getMasked returns ***last4 for a long secret', () => {
    const secret = 'sk-ant-api99-supersecretvalue-xyz1';
    settingsModel.set('anthropic_api_key', secret);
    const masked = settingsModel.getMasked('anthropic_api_key');
    const last4 = secret.slice(-4);
    expect(masked).toBe(`***${last4}`);
  });

  it('getMasked returns *** (no suffix) when plaintext is <= 4 chars', () => {
    settingsModel.set('anthropic_api_key', 'ab12');
    expect(settingsModel.getMasked('anthropic_api_key')).toBe('***');
  });

  it('getMasked returns *** for a single-char secret', () => {
    settingsModel.set('anthropic_api_key', 'x');
    expect(settingsModel.getMasked('anthropic_api_key')).toBe('***');
  });
});

describe('settingsModel.getMasked', () => {
  it('returns plaintext for a non-secret key', () => {
    settingsModel.set('workvault_root', 'C:\\Users\\schmichr\\WorkVault');
    expect(settingsModel.getMasked('workvault_root')).toBe('C:\\Users\\schmichr\\WorkVault');
  });

  it('returns null for an unset key', () => {
    expect(settingsModel.getMasked('never_set_key_abc')).toBeNull();
  });
});
