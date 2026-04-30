/**
 * systemAlert.model.test.ts
 *
 * R-013: when `logAlert` falls back to `console.error` because the
 * underlying insert failed, the error value must be passed through the
 * redactor first. The DB-write error can carry the bound `@detail`
 * parameter on `better-sqlite3` failures, and that detail may contain
 * settings values, Anthropic auth headers, or other secret-shaped keys.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { logAlert, systemAlertModel } from './systemAlert.model.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logAlert — DB-write failures route through the R-013 redactor', () => {
  it('passes the redacted error to console.error (no raw secret-shaped values leak)', () => {
    // Force the insert path to throw an error whose properties carry a
    // secret-shaped key. The redactor should rewrite that key before the
    // value reaches the operator log.
    const fakeError = Object.assign(new Error('insert blew up'), {
      anthropic_api_key: 'sk-ant-super-secret-leaked',
      authorization: 'Bearer leaked-token',
      payload: { value: 'sk-ant-also-leaked' },
    });

    vi.spyOn(systemAlertModel, 'create').mockImplementation(() => {
      throw fakeError;
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logAlert('error', 'reportRun', 'test message', new Error('boom'));

    expect(errSpy).toHaveBeenCalledTimes(1);
    const [tag, redacted] = errSpy.mock.calls[0];
    expect(tag).toBe('[systemAlert] failed to write alert');

    // The redactor should have rewritten the secret-shaped keys in the
    // structurally-cloned shape it returns.
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('sk-ant-super-secret-leaked');
    expect(serialized).not.toContain('Bearer leaked-token');
    expect(serialized).not.toContain('sk-ant-also-leaked');
    expect(serialized).toContain('***redacted***');
  });
});
