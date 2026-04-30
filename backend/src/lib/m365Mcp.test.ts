/**
 * m365Mcp.test.ts — Unit tests for the pure m365Mcp helper.
 *
 * No I/O, no DB, no mocks needed — the module is entirely pure.
 */

import { describe, it, expect } from 'vitest';
import { buildM365Mcp, type M365Config } from './m365Mcp.js';

const FULL_CONFIG: M365Config = {
  enabled: true,
  url: 'https://mcp.anthropic.com/m365/abc123',
  token: 'tok_test_secret',
  name: 'm365',
};

// ---------------------------------------------------------------------------
// Disabled / unconfigured paths
// ---------------------------------------------------------------------------

describe('buildM365Mcp — disabled/unconfigured', () => {
  it('returns all-null/false when cfg is null', () => {
    const result = buildM365Mcp(null);
    expect(result.serverEntry).toBeNull();
    expect(result.betaHeader).toBeNull();
    expect(result.systemPromptBlock).toBeNull();
    expect(result.suppressRecordInsight).toBe(false);
  });

  it('returns all-null/false when enabled=false', () => {
    const result = buildM365Mcp({ ...FULL_CONFIG, enabled: false });
    expect(result.serverEntry).toBeNull();
    expect(result.betaHeader).toBeNull();
    expect(result.systemPromptBlock).toBeNull();
    expect(result.suppressRecordInsight).toBe(false);
  });

  it('returns null serverEntry when url is empty string', () => {
    const result = buildM365Mcp({ ...FULL_CONFIG, url: '' });
    expect(result.serverEntry).toBeNull();
    expect(result.suppressRecordInsight).toBe(false);
  });

  it('returns null serverEntry when token is empty string', () => {
    const result = buildM365Mcp({ ...FULL_CONFIG, token: '' });
    expect(result.serverEntry).toBeNull();
    expect(result.suppressRecordInsight).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fully configured path
// ---------------------------------------------------------------------------

describe('buildM365Mcp — fully configured', () => {
  it('returns expected serverEntry shape', () => {
    const result = buildM365Mcp(FULL_CONFIG);
    expect(result.serverEntry).toEqual({
      type: 'url',
      url: 'https://mcp.anthropic.com/m365/abc123',
      name: 'm365',
      authorization_token: 'tok_test_secret',
    });
  });

  it('returns the correct beta header', () => {
    const result = buildM365Mcp(FULL_CONFIG);
    expect(result.betaHeader).toBe('mcp-client-2025-04-04');
  });

  it('sets suppressRecordInsight=true (R-021)', () => {
    const result = buildM365Mcp(FULL_CONFIG);
    expect(result.suppressRecordInsight).toBe(true);
  });

  it('returns a non-null systemPromptBlock', () => {
    const result = buildM365Mcp(FULL_CONFIG);
    expect(result.systemPromptBlock).not.toBeNull();
    expect(typeof result.systemPromptBlock).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// System prompt block content — strong directives must be present
// ---------------------------------------------------------------------------

describe('buildM365Mcp — pagination prompt block content', () => {
  it('contains the literal string MUST', () => {
    const { systemPromptBlock } = buildM365Mcp(FULL_CONFIG);
    expect(systemPromptBlock).toContain('MUST');
  });

  it('contains the literal string "offset"', () => {
    const { systemPromptBlock } = buildM365Mcp(FULL_CONFIG);
    expect(systemPromptBlock).toContain('offset');
  });

  it('contains the literal string "50"', () => {
    const { systemPromptBlock } = buildM365Mcp(FULL_CONFIG);
    expect(systemPromptBlock).toContain('50');
  });

  it('contains a Worked example section', () => {
    const { systemPromptBlock } = buildM365Mcp(FULL_CONFIG);
    expect(systemPromptBlock).toContain('Worked example');
  });
});
