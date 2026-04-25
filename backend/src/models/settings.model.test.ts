import { describe, it, expect } from 'vitest';
import { db } from '../db/database.js';
import { settingsModel } from './settings.model.js';

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
});

describe('settingsModel — anthropic_api_key encryption stub', () => {
  it('stores value with enc: prefix for anthropic_api_key', () => {
    // The encrypt stub is a pass-through, so the stored raw value should be
    // 'enc:' + the original string.
    const key = 'anthropic_api_key';
    const secret = 'sk-ant-test1234';

    settingsModel.set(key, secret);

    const row = db
      .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
      .get(key);
    expect(row).toBeDefined();
    expect(row!.value.startsWith('enc:')).toBe(true);
  });

  it('get(anthropic_api_key) returns plaintext despite the enc: prefix', () => {
    const secret = 'sk-ant-abcd5678';
    settingsModel.set('anthropic_api_key', secret);
    expect(settingsModel.get('anthropic_api_key')).toBe(secret);
  });
});

describe('settingsModel.getMasked', () => {
  it('returns ***last4 shape for anthropic_api_key when value length > 4', () => {
    const secret = 'sk-ant-api99-supersecretvalue-xyz1';
    settingsModel.set('anthropic_api_key', secret);
    const masked = settingsModel.getMasked('anthropic_api_key');
    expect(masked).not.toBeNull();
    // Must be "***" followed by the last 4 characters of the plaintext
    const last4 = secret.slice(-4);
    expect(masked).toBe(`***${last4}`);
  });

  it('returns *** (no suffix) for anthropic_api_key when plaintext is <= 4 chars', () => {
    settingsModel.set('anthropic_api_key', 'ab12');
    expect(settingsModel.getMasked('anthropic_api_key')).toBe('***');
  });

  it('returns *** for a single-char secret value', () => {
    settingsModel.set('anthropic_api_key', 'x');
    expect(settingsModel.getMasked('anthropic_api_key')).toBe('***');
  });

  it('returns plaintext for a non-secret key', () => {
    settingsModel.set('workvault_root', 'C:\\Users\\schmichr\\WorkVault');
    expect(settingsModel.getMasked('workvault_root')).toBe('C:\\Users\\schmichr\\WorkVault');
  });

  it('returns null for an unset key', () => {
    expect(settingsModel.getMasked('never_set_key_abc')).toBeNull();
  });
});
