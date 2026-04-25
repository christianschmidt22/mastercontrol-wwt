/**
 * agentConfig.model.test.ts
 *
 * Tests the fallback chain and partial-unique-index constraint (R-004).
 */

import { describe, it, expect } from 'vitest';
import { db } from '../db/database.js';
import { agentConfigModel } from './agentConfig.model.js';
import { makeOrg } from '../test/factories.js';

// ---------------------------------------------------------------------------
// getEffective — fallback chain
// ---------------------------------------------------------------------------

describe('agentConfigModel.getEffective — fallback chain', () => {
  it('returns the org-level override when one exists', () => {
    const org = makeOrg({ type: 'customer', name: 'Override Org' });

    // Insert the archetype first (required by FK-less model but good to have)
    agentConfigModel.upsertArchetype('customer', {
      system_prompt_template: 'archetype prompt',
      tools_enabled: [],
      model: 'claude-sonnet-4-6',
    });

    // Insert an override for this org
    agentConfigModel.upsertOverride('customer', org.id, {
      system_prompt_template: 'override prompt for org',
      tools_enabled: ['web_search'],
      model: 'claude-sonnet-4-6',
    });

    const result = agentConfigModel.getEffective('customer', org.id);
    expect(result).not.toBeNull();
    expect(result!.system_prompt_template).toBe('override prompt for org');
    expect(result!.tools_enabled).toContain('web_search');
    expect(result!.organization_id).toBe(org.id);
  });

  it('falls back to archetype when no override exists for the org', () => {
    const org = makeOrg({ type: 'customer', name: 'No Override Org' });

    agentConfigModel.upsertArchetype('customer', {
      system_prompt_template: 'archetype fallback prompt',
      tools_enabled: [],
      model: 'claude-sonnet-4-6',
    });

    // No override for this org
    const result = agentConfigModel.getEffective('customer', org.id);
    expect(result).not.toBeNull();
    expect(result!.system_prompt_template).toBe('archetype fallback prompt');
    expect(result!.organization_id).toBeNull();
  });

  it('returns null when neither override nor archetype exists', () => {
    // We query a different section that has no archetype seeded
    // Note: initSchema may seed defaults; we use a unique section name
    // by ensuring the DB is clean for this section via savepoint.
    // The simplest approach: query with null org id for oem if no archetype seeded.

    // Remove any existing oem archetype so we can test the null return.
    db.prepare("DELETE FROM agent_configs WHERE section = 'oem' AND organization_id IS NULL").run();

    const result = agentConfigModel.getEffective('oem', null);
    expect(result).toBeNull();
  });

  it('returns archetype when org_id is null and archetype exists', () => {
    agentConfigModel.upsertArchetype('customer', {
      system_prompt_template: 'null org archetype',
      tools_enabled: [],
    });

    const result = agentConfigModel.getEffective('customer', null);
    expect(result).not.toBeNull();
    expect(result!.system_prompt_template).toBe('null org archetype');
  });
});

// ---------------------------------------------------------------------------
// R-004 partial unique index — duplicate archetype throws
// ---------------------------------------------------------------------------

describe('agentConfigModel — R-004 partial unique index', () => {
  it('upserting the archetype twice updates in-place (INSERT OR REPLACE)', () => {
    agentConfigModel.upsertArchetype('customer', {
      system_prompt_template: 'first',
      tools_enabled: [],
    });

    // Second upsert should not throw — it replaces
    expect(() => {
      agentConfigModel.upsertArchetype('customer', {
        system_prompt_template: 'second',
        tools_enabled: [],
      });
    }).not.toThrow();

    const archetype = agentConfigModel.getArchetype('customer');
    expect(archetype!.system_prompt_template).toBe('second');
  });

  it('inserting a second archetype row with same section via raw SQL throws SQLITE_CONSTRAINT', () => {
    // Ensure one archetype exists
    agentConfigModel.upsertArchetype('customer', {
      system_prompt_template: 'existing',
      tools_enabled: [],
    });

    // Attempt a raw INSERT that bypasses INSERT OR REPLACE
    const stmt = db.prepare(
      `INSERT INTO agent_configs (section, organization_id, system_prompt_template, tools_enabled, model)
       VALUES ('customer', NULL, 'duplicate', '[]', 'claude-sonnet-4-6')`
    );

    expect(() => stmt.run()).toThrow(/UNIQUE constraint failed/);
  });

  it('upsertOverride updates in-place for same (section, org) pair', () => {
    const org = makeOrg({ type: 'customer', name: 'Override Update Org' });

    agentConfigModel.upsertOverride('customer', org.id, {
      system_prompt_template: 'v1',
      tools_enabled: [],
    });

    agentConfigModel.upsertOverride('customer', org.id, {
      system_prompt_template: 'v2',
      tools_enabled: ['web_search'],
    });

    const result = agentConfigModel.getEffective('customer', org.id);
    expect(result!.system_prompt_template).toBe('v2');
    expect(result!.tools_enabled).toContain('web_search');
  });
});

// ---------------------------------------------------------------------------
// tools_enabled JSON round-trip
// ---------------------------------------------------------------------------

describe('agentConfigModel — tools_enabled JSON round-trip', () => {
  it('stores and retrieves tools_enabled as an array', () => {
    agentConfigModel.upsertArchetype('customer', {
      system_prompt_template: 'json test',
      tools_enabled: ['web_search', 'record_insight'],
      model: 'claude-sonnet-4-6',
    });

    const result = agentConfigModel.getArchetype('customer');
    expect(result).not.toBeNull();
    expect(result!.tools_enabled).toEqual(['web_search', 'record_insight']);
  });

  it('returns an empty array when tools_enabled is empty', () => {
    agentConfigModel.upsertArchetype('customer', {
      system_prompt_template: 'empty tools',
      tools_enabled: [],
    });

    const result = agentConfigModel.getArchetype('customer');
    expect(result!.tools_enabled).toEqual([]);
  });
});
