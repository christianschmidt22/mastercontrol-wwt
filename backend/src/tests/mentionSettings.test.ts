/**
 * mentionSettings.test.ts
 *
 * Verifies that mention.service reads the extraction model and confidence
 * threshold from settings at call time rather than using hardcoded values.
 *
 * Strategy:
 *   - Mock the settings model to return custom values.
 *   - Mock the Anthropic SDK to capture the `model` field.
 *   - Verify extractMentions uses the configured model.
 *   - Verify that mentions below the configured threshold are filtered out.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: @anthropic-ai/sdk — hoisted so it runs before module evaluation
// ---------------------------------------------------------------------------

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
// Mock: settings.model — returns custom extraction settings
// ---------------------------------------------------------------------------

const mockSettingsStore: Record<string, string> = {
  anthropic_api_key: 'sk-ant-test',
  mention_extraction_model: 'claude-haiku-4-5',
  mention_extraction_threshold: '0.5',
};

vi.mock('../models/settings.model.js', () => ({
  settingsModel: {
    get: vi.fn((key: string) => mockSettingsStore[key] ?? null),
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

import { extractMentions, clearOrgCache } from '../services/mention.service.js';
import { organizationModel } from '../models/organization.model.js';
import { noteModel } from '../models/note.model.js';
import { noteMentionModel } from '../models/noteMention.model.js';
import { settingsModel } from '../models/settings.model.js';

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

describe('mention.service — reads model from settings at call time', () => {
  beforeEach(() => {
    clearOrgCache();
    vi.clearAllMocks();
    // Reset mock store to defaults
    mockSettingsStore['mention_extraction_model'] = 'claude-haiku-4-5';
    mockSettingsStore['mention_extraction_threshold'] = '0.5';
    // Re-apply the mock implementation after clearAllMocks
    vi.mocked(settingsModel.get).mockImplementation((key: string) => mockSettingsStore[key] ?? null);
  });

  it('uses the model returned by settings, not a hardcoded value', async () => {
    mockSettingsStore['mention_extraction_model'] = 'claude-sonnet-4-5';
    vi.mocked(settingsModel.get).mockImplementation((key: string) => mockSettingsStore[key] ?? null);

    const org = makeOrg('Settings Model Org');
    const note = makeNote(org.id);

    hoistedCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[]' }],
    });

    await extractMentions(note.id, 'Content to check model setting.');

    expect(hoistedCreate).toHaveBeenCalledOnce();
    const callArgs = hoistedCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['model']).toBe('claude-sonnet-4-5');
  });

  it('falls back to claude-haiku-4-5 when settings key is absent', async () => {
    mockSettingsStore['mention_extraction_model'] = undefined as unknown as string;
    vi.mocked(settingsModel.get).mockImplementation((key: string) => mockSettingsStore[key] ?? null);

    const org = makeOrg('Fallback Model Org');
    const note = makeNote(org.id);

    hoistedCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[]' }],
    });

    await extractMentions(note.id, 'Content to check fallback model.');

    const callArgs = hoistedCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['model']).toBe('claude-haiku-4-5');
  });
});

describe('mention.service — reads confidence threshold from settings at call time', () => {
  beforeEach(() => {
    clearOrgCache();
    vi.clearAllMocks();
    mockSettingsStore['mention_extraction_model'] = 'claude-haiku-4-5';
    mockSettingsStore['mention_extraction_threshold'] = '0.5';
    vi.mocked(settingsModel.get).mockImplementation((key: string) => mockSettingsStore[key] ?? null);
  });

  it('discards mentions below the configured threshold', async () => {
    // Set a high threshold — only very confident mentions pass
    mockSettingsStore['mention_extraction_threshold'] = '0.8';
    vi.mocked(settingsModel.get).mockImplementation((key: string) => mockSettingsStore[key] ?? null);

    const org = makeOrg('High Threshold Org');
    const note = makeNote(org.id);

    mockAnthropicResponse([{ name: 'High Threshold Org', confidence: 0.75 }]);

    await extractMentions(note.id, 'Mention of High Threshold Org with confidence 0.75.');

    // 0.75 < 0.8 — should be discarded
    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions).toHaveLength(0);
  });

  it('accepts mentions at or above the configured threshold', async () => {
    mockSettingsStore['mention_extraction_threshold'] = '0.7';
    vi.mocked(settingsModel.get).mockImplementation((key: string) => mockSettingsStore[key] ?? null);

    const org = makeOrg('Accept Threshold Org');
    const note = makeNote(org.id);

    mockAnthropicResponse([{ name: 'Accept Threshold Org', confidence: 0.7 }]);

    await extractMentions(note.id, 'Mention of Accept Threshold Org at exactly 0.7.');

    // 0.7 >= 0.7 — should be accepted
    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].confidence).toBe(0.7);
  });

  it('falls back to 0.5 threshold when the setting is missing', async () => {
    mockSettingsStore['mention_extraction_threshold'] = undefined as unknown as string;
    vi.mocked(settingsModel.get).mockImplementation((key: string) => mockSettingsStore[key] ?? null);

    const org = makeOrg('Default Threshold Org');
    const note = makeNote(org.id);

    // confidence 0.49 — below default 0.5 — should be discarded
    mockAnthropicResponse([{ name: 'Default Threshold Org', confidence: 0.49 }]);

    await extractMentions(note.id, 'Content for default threshold test.');

    const mentions = noteMentionModel.listByNote(note.id);
    expect(mentions).toHaveLength(0);
  });

  it('reads settings fresh on each call (not cached at module load)', async () => {
    const org = makeOrg('Fresh Read Org');
    const note1 = makeNote(org.id);
    const note2 = noteModel.create({ organization_id: org.id, content: 'second note' });

    // First call with threshold 0.5 — 0.6 should pass
    mockSettingsStore['mention_extraction_threshold'] = '0.5';
    vi.mocked(settingsModel.get).mockImplementation((key: string) => mockSettingsStore[key] ?? null);
    mockAnthropicResponse([{ name: 'Fresh Read Org', confidence: 0.6 }]);
    await extractMentions(note1.id, 'Note for Fresh Read Org first pass.');

    const mentions1 = noteMentionModel.listByNote(note1.id);
    expect(mentions1).toHaveLength(1);

    // Second call — raise threshold so 0.6 no longer passes
    clearOrgCache();
    mockSettingsStore['mention_extraction_threshold'] = '0.8';
    vi.mocked(settingsModel.get).mockImplementation((key: string) => mockSettingsStore[key] ?? null);
    mockAnthropicResponse([{ name: 'Fresh Read Org', confidence: 0.6 }]);
    await extractMentions(note2.id, 'Note for Fresh Read Org second pass.');

    const mentions2 = noteMentionModel.listByNote(note2.id);
    expect(mentions2).toHaveLength(0);
  });
});
