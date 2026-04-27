/**
 * AgentOverridesPanel.tsx
 *
 * Shows all per-org agent config overrides for the active section.
 * - Lists each override: org name, section pill, "Edit override" toggle
 * - Inline expanding editor (NOT a modal) with template/tools/model + Delete
 * - "Add override" CTA → org picker → calls createAgentConfig
 */

import { useState, useCallback } from 'react';
import type { AgentConfig, Organization } from '../../types';
import {
  useCreateAgentConfig,
  useDeleteAgentConfig,
} from '../../api/useAgentConfigs';
import { AgentSectionEditor } from './AgentSectionEditor';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentOverridesPanelProps {
  configs: AgentConfig[];
  section: 'customer' | 'oem';
  orgs: Organization[];
  /** Section default (organization_id IS NULL) — used to seed new overrides */
  sectionDefault: AgentConfig | undefined;
}

// ---------------------------------------------------------------------------
// Inline delete confirmation inside the expanded panel
// ---------------------------------------------------------------------------

interface OverrideInlinePanelProps {
  config: AgentConfig;
  orgName: string;
  onClose: () => void;
}

function OverrideInlinePanel({ config, orgName, onClose }: OverrideInlinePanelProps) {
  const deleteMutation = useDeleteAgentConfig();

  const handleDelete = useCallback(async () => {
    await deleteMutation.mutateAsync(config.id);
    onClose();
  }, [config.id, deleteMutation, onClose]);

  return (
    <div
      style={{
        marginTop: 12,
        padding: '20px 24px',
        border: '1px solid var(--rule)',
        borderRadius: 6,
        background: 'var(--bg-2)',
      }}
    >
      <p style={{
        fontFamily: 'var(--body)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--ink-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        margin: '0 0 16px',
      }}>
        Override for {orgName}
      </p>

      <AgentSectionEditor config={config} idPrefix={`override-${config.id}`} />

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
        <button
          type="button"
          aria-label={`Delete override for ${orgName}`}
          disabled={deleteMutation.isPending}
          onClick={() => void handleDelete()}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            fontWeight: 500,
            padding: '6px 14px',
            borderRadius: 6,
            cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
            border: '1px solid var(--rule)',
            background: 'none',
            color: 'var(--ink-2)',
            opacity: deleteMutation.isPending ? 0.5 : 1,
            transition: 'opacity 200ms var(--ease)',
          }}
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete override'}
        </button>
        {deleteMutation.isError && (
          <span
            role="alert"
            style={{ marginLeft: 12, fontFamily: 'var(--body)', fontSize: 12, color: 'var(--accent)' }}
          >
            {deleteMutation.error?.message ?? 'Delete failed'}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function AgentOverridesPanel({
  configs,
  section,
  orgs,
  sectionDefault,
}: AgentOverridesPanelProps) {
  const createMutation = useCreateAgentConfig();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);

  // Overrides for this section
  const overrides = configs.filter(
    (c) => c.section === section && c.organization_id !== null,
  );

  // Org IDs that already have an override for this section
  const overriddenOrgIds = new Set(overrides.map((c) => c.organization_id));

  // Orgs that can still get an override
  const availableOrgs = orgs.filter((o) => !overriddenOrgIds.has(o.id));

  // Map org id → name for display
  const orgById = new Map(orgs.map((o) => [o.id, o.name]));

  const handleAddOverride = useCallback(
    async (orgId: number) => {
      await createMutation.mutateAsync({
        section,
        organization_id: orgId,
        system_prompt_template: sectionDefault?.system_prompt_template ?? '',
        tools_enabled: sectionDefault?.tools_enabled ?? {},
        model: sectionDefault?.model ?? 'claude-sonnet-4-6',
      });
      setShowAddPicker(false);
    },
    [createMutation, section, sectionDefault],
  );

  return (
    <section aria-labelledby="overrides-heading" style={{ marginTop: 48 }}>
      {/* Section heading + Add CTA */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
      }}>
        <h2
          id="overrides-heading"
          style={{
            fontFamily: 'var(--display)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--ink-1)',
            margin: 0,
          }}
        >
          Per-org overrides
        </h2>

        {!showAddPicker && availableOrgs.length > 0 && (
          <button
            type="button"
            aria-label="Add per-org override"
            onClick={() => setShowAddPicker(true)}
            style={{
              fontFamily: 'var(--body)',
              fontSize: 13,
              fontWeight: 600,
              padding: '7px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              border: '1px solid var(--accent)',
              background: 'var(--bg)',
              color: 'var(--accent)',
              transition: 'opacity 200ms var(--ease)',
            }}
          >
            + Add override
          </button>
        )}
      </div>

      {/* Add-override org picker */}
      {showAddPicker && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          padding: '12px 16px',
          border: '1px solid var(--rule)',
          borderRadius: 6,
          background: 'var(--bg-2)',
        }}>
          <label
            htmlFor="add-override-picker"
            style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--ink-2)', flexShrink: 0 }}
          >
            Organization:
          </label>
          <select
            id="add-override-picker"
            defaultValue=""
            aria-label="Select organization for override"
            onChange={(e) => {
              const val = Number(e.target.value);
              if (val > 0) void handleAddOverride(val);
            }}
            style={{
              fontFamily: 'var(--body)',
              fontSize: 13,
              color: 'var(--ink-1)',
              background: 'var(--bg)',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="" disabled>— select org —</option>
            {availableOrgs.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowAddPicker(false)}
            aria-label="Cancel add override"
            style={{
              fontFamily: 'var(--body)',
              fontSize: 12,
              padding: '6px 12px',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              background: 'none',
              color: 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {createMutation.isError && (
        <p role="alert" style={{ fontFamily: 'var(--body)', fontSize: 12, color: 'var(--accent)', margin: '0 0 12px' }}>
          {createMutation.error?.message ?? 'Failed to create override'}
        </p>
      )}

      {/* Override list */}
      {overrides.length === 0 ? (
        <div
          role="status"
          style={{
            padding: '24px 0',
            fontFamily: 'var(--body)',
            fontSize: 14,
            color: 'var(--ink-3)',
            border: '1px dashed var(--rule)',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          No per-org overrides yet — the section default applies to all orgs.
        </div>
      ) : (
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {overrides.map((override) => {
            const orgName = orgById.get(override.organization_id ?? -1) ?? `Org #${String(override.organization_id)}`;
            const isExpanded = expandedId === override.id;

            return (
              <li
                key={override.id}
                style={{
                  border: '1px solid var(--rule)',
                  borderRadius: 6,
                  padding: '12px 16px',
                  background: isExpanded ? 'var(--bg-2)' : 'var(--bg)',
                  transition: 'background 200ms var(--ease)',
                }}
              >
                {/* Row: org name + section pill + edit button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--body)', fontSize: 14, color: 'var(--ink-1)', fontWeight: 500, flex: '1 1 0', minWidth: 0 }}>
                    {orgName}
                  </span>

                  {/* Section pill */}
                  <span
                    aria-label={`Section: ${override.section}`}
                    style={{
                      fontFamily: 'var(--body)',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--ink-2)',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--rule)',
                      borderRadius: 4,
                      padding: '3px 8px',
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    {override.section}
                  </span>

                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Close' : 'Edit'} override for ${orgName}`}
                    onClick={() => setExpandedId(isExpanded ? null : override.id)}
                    style={{
                      fontFamily: 'var(--body)',
                      fontSize: 12,
                      fontWeight: 500,
                      padding: '5px 12px',
                      border: '1px solid var(--rule)',
                      borderRadius: 6,
                      background: 'none',
                      color: 'var(--ink-2)',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'color 200ms var(--ease)',
                    }}
                  >
                    {isExpanded ? 'Close' : 'Edit override'}
                  </button>
                </div>

                {/* Inline expanding editor */}
                {isExpanded && (
                  <OverrideInlinePanel
                    config={override}
                    orgName={orgName}
                    onClose={() => setExpandedId(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
