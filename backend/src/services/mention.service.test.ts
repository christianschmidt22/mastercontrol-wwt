/**
 * mention.service.test.ts
 *
 * Tests for extractMentions():
 *   - Mention rows are inserted with source='ai_auto'.
 *   - Confidence < 0.5 entries are filtered out.
 *   - The Anthropic call sets tools=[] (R-021).
 *   - The note content is wrapped in <untrusted_document> (R-026).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: @anthropic-ai/sdk — must appear before any service import
// ---------------------------------------------------------------------------

// We use vi.hoisted() so the factory can reference `hoistedCreate` which must
// be available inside the vi.mock factory body (factories run before module
// evaluation, so top-level vars are not yet initialized there).
const { hoistedCreate } = vi.hoisted(() => ({
  hoistedCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: hoistedCreate,
    },
  }));
  return { default: MockAnthropic };
});

// ---------------------------------------------------------------------------
// Mock: settings.model — provide a fake API key
// ---------------------------------------------------------------------------
vi.mock('../models/settings.model.js', () => ({
  settingsModel: {
    get: vi.fn((key: string) => {
      if (key === 'anthropic_api_key') return 'sk-ant-test';
      return null;
    }),
    getMasked: vi.fn(() => '***test'),
    set: vi.fn(),
    remove: vi.fn(),
  },
  SECRET_KEYS: new Set(['anthropic_api_key']),
  warmDpapi: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
import { extractMentions, clearOrgCache } from './mention.service.js';
import { noteMentionModel } from '../models/noteMention.model.js';
import { organizationModel } from '../models/organization.model.js';
import { noteModel } from '../models/note.model.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrg(name: string) {
  return organizationModel.create({ type: 'customer', name });
}

function makeNote(orgId: number) {
  return noteModel.create({ organization_id: orgId, content: 'test note content' });
}

function mockAnthropicResponse(mentions: Array<{ name: string; confidence: number }>) {
  hoistedCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(mentions) }],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mention.service — extractMentions', () => {
  beforeEach(() => {
    // Clear the org cache so each test starts fresh.
    clearOrgCache();
    vi.clearAllMocks();
  });

  it('inserts mention rows with source="ai_auto" for high-confidence matches', async () => {
    const org = makeOrg('Acme Corp');
    const note = makeNote(org.id);

    mockAnthropicResponse([{ name: 'Acme Corp', confidence: 0.9 }]);

    await extractMentions(note.id, 'This note is about Acme Corp and their renewal.');

    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions.length).toBe(1);
    expect(mentions[0]!.mentioned_org_id).toBe(org.id);
    expect(mentions[0]!.source).toBe('ai_auto');
    expect(mentions[0]!.confidence).toBe(0.9);
  });

  it('filters out mentions with confidence < 0.5', async () => {
    const org = makeOrg('Low Conf Org');
    const note = makeNote(org.id);

    mockAnthropicResponse([
      { name: 'Low Conf Org', confidence: 0.3 },
      { name: 'Low Conf Org', confidence: 0.49 },
    ]);

    await extractMentions(note.id, 'Vague reference to low confidence org.');

    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions.length).toBe(0);
  });

  it('includes mentions at exactly the 0.5 threshold', async () => {
    const org = makeOrg('Threshold Org');
    const note = makeNote(org.id);

    mockAnthropicResponse([{ name: 'Threshold Org', confidence: 0.5 }]);

    await extractMentions(note.id, 'Threshold Org was mentioned.');

    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions.length).toBe(1);
    expect(mentions[0]!.confidence).toBe(0.5);
  });

  it('skips org names not in the DB even if the model returns them', async () => {
    const org = makeOrg('Real Org');
    const note = makeNote(org.id);

    mockAnthropicResponse([
      { name: 'Real Org', confidence: 0.8 },
      { name: 'Phantom Org XYZ', confidence: 0.95 }, // not in DB
    ]);

    await extractMentions(note.id, 'Real Org and Phantom Org XYZ mentioned.');

    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions.length).toBe(1);
    expect(mentions[0]!.mentioned_org_id).toBe(org.id);
  });

  it('performs case-insensitive org name matching', async () => {
    const org = makeOrg('CaseSensitive Corp');
    const note = makeNote(org.id);

    // The model returns a lowercased name.
    mockAnthropicResponse([{ name: 'casesensitive corp', confidence: 0.8 }]);

    await extractMentions(note.id, 'casesensitive corp mentioned in lowercase.');

    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions.length).toBe(1);
    expect(mentions[0]!.mentioned_org_id).toBe(org.id);
  });

  it('is a no-op when the Anthropic response is an empty array', async () => {
    const org = makeOrg('Quiet Org');
    const note = makeNote(org.id);

    mockAnthropicResponse([]);

    await extractMentions(note.id, 'Nothing relevant here.');

    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions.length).toBe(0);
  });

  it('the Anthropic call sets tools=[] (R-021)', async () => {
    const org = makeOrg('Tools Check Org');
    const note = makeNote(org.id);

    hoistedCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[]' }],
    });

    await extractMentions(note.id, 'Checking tool constraint.');

    expect(hoistedCreate).toHaveBeenCalledOnce();
    const callArgs = hoistedCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs['tools']).toEqual([]);
  });

  it('the Anthropic call wraps content in <untrusted_document> (R-026)', async () => {
    const org = makeOrg('Untrusted Doc Org');
    const note = makeNote(org.id);

    hoistedCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[]' }],
    });

    const noteContent = 'Sensitive note content here.';
    await extractMentions(note.id, noteContent);

    const callArgs = hoistedCreate.mock.calls[0]![0] as Record<string, unknown>;
    const messages = callArgs['messages'] as Array<{ role: string; content: string }>;
    expect(messages[0]!.content).toContain('<untrusted_document');
    expect(messages[0]!.content).toContain(noteContent);
    expect(messages[0]!.content).toContain('</untrusted_document>');
  });

  it('uses the claude-haiku-4-5 model for cost efficiency', async () => {
    const org = makeOrg('Haiku Model Org');
    const note = makeNote(org.id);

    hoistedCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[]' }],
    });

    await extractMentions(note.id, 'Content to check model.');

    const callArgs = hoistedCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs['model']).toBe('claude-haiku-4-5');
  });

  it('handles malformed JSON from the Anthropic response gracefully', async () => {
    const org = makeOrg('Parse Error Org');
    const note = makeNote(org.id);

    hoistedCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json!!!' }],
    });

    // Should not throw — parse errors are swallowed.
    await expect(extractMentions(note.id, 'Some content.')).resolves.not.toThrow();

    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions.length).toBe(0);
  });

  it('upserts mentions on re-extraction (no duplicate rows)', async () => {
    const org = makeOrg('Upsert Org');
    const note = makeNote(org.id);

    mockAnthropicResponse([{ name: 'Upsert Org', confidence: 0.7 }]);
    await extractMentions(note.id, 'First extraction.');

    // Second extraction with higher confidence.
    clearOrgCache();
    mockAnthropicResponse([{ name: 'Upsert Org', confidence: 0.9 }]);
    await extractMentions(note.id, 'Second extraction.');

    const mentions = noteMentionModel.listByNote(note.id);
    // Should still be only one row (upserted).
    const forThisOrg = mentions.filter((m) => m.mentioned_org_id === org.id);
    expect(forThisOrg.length).toBe(1);
    expect(forThisOrg[0]!.confidence).toBe(0.9);
  });
});
