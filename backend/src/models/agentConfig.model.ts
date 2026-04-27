import { db } from '../db/database.js';

export type AgentSection = 'customer' | 'oem';

interface AgentConfigRow {
  id: number;
  section: AgentSection;
  organization_id: number | null;
  system_prompt_template: string;
  tools_enabled: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface AgentConfig {
  id: number;
  section: AgentSection;
  organization_id: number | null;
  system_prompt_template: string;
  tools_enabled: string[];
  model: string;
  created_at: string;
  updated_at: string;
}

export interface AgentConfigInput {
  system_prompt_template: string;
  tools_enabled?: string[];
  model?: string;
}

export interface AgentConfigUpdate {
  system_prompt_template?: string;
  tools_enabled?: Record<string, unknown>;
  model?: string;
}

const listAllStmt = db.prepare<[], AgentConfigRow>(
  'SELECT * FROM agent_configs ORDER BY section, organization_id IS NOT NULL, organization_id'
);
const getByOrgStmt = db.prepare<[AgentSection, number], AgentConfigRow>(
  'SELECT * FROM agent_configs WHERE section = ? AND organization_id = ?'
);
const getArchetypeStmt = db.prepare<[AgentSection], AgentConfigRow>(
  'SELECT * FROM agent_configs WHERE section = ? AND organization_id IS NULL'
);
const getByIdStmt = db.prepare<[number], AgentConfigRow>('SELECT * FROM agent_configs WHERE id = ?');
const updateByIdStmt = db.prepare<[string, string, string, number]>(
  `UPDATE agent_configs
   SET system_prompt_template = ?, tools_enabled = ?, model = ?, updated_at = datetime('now')
   WHERE id = ?`
);

/**
 * R-004: Uses two partial unique indexes (uq_agent_configs_archetype,
 * uq_agent_configs_override) rather than a table-level UNIQUE constraint,
 * because SQLite treats NULLs as distinct in UNIQUE constraints, which would
 * permit duplicate archetype rows.
 *
 * SQLite's INSERT OR REPLACE (a.k.a. REPLACE INTO) works with partial indexes —
 * it deletes the conflicting row and re-inserts, preserving the id autoincrement
 * value from the new row (which is fine here). We use INSERT OR REPLACE because
 * SQLite's `ON CONFLICT(col) DO UPDATE` syntax requires an exact column list
 * in the conflict target and does not accept partial-index names.
 */
const upsertArchetypeStmt = db.prepare<[AgentSection, string, string, string]>(
  `INSERT OR REPLACE INTO agent_configs (section, organization_id, system_prompt_template, tools_enabled, model, updated_at)
   VALUES (?, NULL, ?, ?, ?, datetime('now'))`
);

const upsertOverrideStmt = db.prepare<[AgentSection, number, string, string, string]>(
  `INSERT OR REPLACE INTO agent_configs (section, organization_id, system_prompt_template, tools_enabled, model, updated_at)
   VALUES (?, ?, ?, ?, ?, datetime('now'))`
);

// Only override rows (organization_id IS NOT NULL) are deletable. The two
// section archetypes are immutable from the API surface — they're seeded by
// initSchema() and act as the fallback default for every org.
const deleteOverrideByIdStmt = db.prepare<[number]>(
  'DELETE FROM agent_configs WHERE id = ? AND organization_id IS NOT NULL'
);

function hydrate(row: AgentConfigRow): AgentConfig {
  return {
    ...row,
    tools_enabled: JSON.parse(row.tools_enabled) as string[],
  };
}

export const agentConfigModel = {
  /** Return every agent_config row (both archetypes and per-org overrides). */
  listAll: (): AgentConfig[] => listAllStmt.all().map(hydrate),

  /**
   * Partial-patch update by id. Reads the current row first, applies only the
   * supplied fields, and writes back. Returns undefined if the id does not exist.
   */
  updateById: (id: number, patch: AgentConfigUpdate): AgentConfig | undefined => {
    const existing = getByIdStmt.get(id);
    if (!existing) return undefined;
    const next = hydrate(existing);
    const newTemplate = patch.system_prompt_template ?? next.system_prompt_template;
    const newTools = patch.tools_enabled !== undefined
      ? JSON.stringify(patch.tools_enabled)
      : existing.tools_enabled;
    const newModel = patch.model ?? next.model;
    updateByIdStmt.run(newTemplate, newTools, newModel, id);
    const updated = getByIdStmt.get(id);
    return updated ? hydrate(updated) : undefined;
  },

  /**
   * Fallback chain: (section, org_id) → (section, NULL archetype).
   * Returns null only if neither exists (the archetype should always exist
   * after initSchema seeds the defaults).
   */
  getEffective: (section: AgentSection, organizationId: number | null): AgentConfig | null => {
    if (organizationId !== null) {
      const override = getByOrgStmt.get(section, organizationId);
      if (override) return hydrate(override);
    }
    const archetype = getArchetypeStmt.get(section);
    return archetype ? hydrate(archetype) : null;
  },

  getArchetype: (section: AgentSection): AgentConfig | null => {
    const row = getArchetypeStmt.get(section);
    return row ? hydrate(row) : null;
  },

  getById: (id: number): AgentConfig | null => {
    const row = getByIdStmt.get(id);
    return row ? hydrate(row) : null;
  },

  /** Write the section-wide archetype (organization_id IS NULL). */
  upsertArchetype: (section: AgentSection, input: AgentConfigInput): AgentConfig => {
    upsertArchetypeStmt.run(
      section,
      input.system_prompt_template,
      JSON.stringify(input.tools_enabled ?? []),
      input.model ?? 'claude-sonnet-4-6'
    );
    return hydrate(getArchetypeStmt.get(section)!);
  },

  /** Write a per-org override for the given section. */
  upsertOverride: (
    section: AgentSection,
    organizationId: number,
    input: AgentConfigInput
  ): AgentConfig => {
    upsertOverrideStmt.run(
      section,
      organizationId,
      input.system_prompt_template,
      JSON.stringify(input.tools_enabled ?? []),
      input.model ?? 'claude-sonnet-4-6'
    );
    return hydrate(getByOrgStmt.get(section, organizationId)!);
  },

  /**
   * Delete a per-org override row. Returns true if a row was deleted, false
   * if no matching override existed (or the id pointed at an archetype row,
   * which is intentionally protected from deletion).
   */
  deleteOverride: (id: number): boolean => {
    const result = deleteOverrideByIdStmt.run(id);
    return result.changes > 0;
  },
};
