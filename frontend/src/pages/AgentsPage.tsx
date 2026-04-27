/**
 * AgentsPage.tsx — Phase 1
 *
 * Agent configuration hub.
 *  • 2-tab strip: "Customer agent" / "OEM agent"
 *  • Section editor: template textarea, variable reference, tools toggles,
 *    model picker, save/discard bar
 *  • Per-org overrides section below the editor
 *
 * Each tab targets the section default (organization_id IS NULL).
 * Overrides (organization_id IS NOT NULL) are listed below and can be
 * expanded inline for editing.
 */

import { useState, useCallback, useRef } from 'react';
import { useAgentConfigs } from '../api/useAgentConfigs';
import { useOrganizations } from '../api/useOrganizations';
import { AgentSectionEditor } from '../components/agents/AgentSectionEditor';
import { AgentOverridesPanel } from '../components/agents/AgentOverridesPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentSection = 'customer' | 'oem';

const SECTIONS: AgentSection[] = ['customer', 'oem'];
const SECTION_LABELS: Record<AgentSection, string> = {
  customer: 'Customer agent',
  oem: 'OEM agent',
};

// ---------------------------------------------------------------------------
// AgentsPage
// ---------------------------------------------------------------------------

export function AgentsPage() {
  const [activeSection, setActiveSection] = useState<AgentSection>('customer');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const { data: configs, isLoading: configsLoading, isError: configsError } = useAgentConfigs();
  const { data: orgs } = useOrganizations();

  // Section defaults
  const activeConfig = configs?.find(
    (c) => c.section === activeSection && c.organization_id === null,
  );

  // Arrow-key navigation on tab strip
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      let next: number | null = null;
      if (e.key === 'ArrowRight') next = (idx + 1) % SECTIONS.length;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + SECTIONS.length) % SECTIONS.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = SECTIONS.length - 1;

      if (next !== null) {
        e.preventDefault();
        const nextSection = SECTIONS[next];
        if (nextSection) setActiveSection(nextSection);
        tabRefs.current[next]?.focus();
      }
    },
    [],
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px' }}>
      {/* ---------------------------------------------------------------- */}
      {/* Page header                                                       */}
      {/* ---------------------------------------------------------------- */}
      <header style={{ marginBottom: 32 }}>
        <p style={{
          fontFamily: 'var(--body)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ink-3)',
          margin: '0 0 6px',
        }}>
          AGENTS
        </p>
        <h1 style={{
          fontFamily: 'var(--display)',
          fontSize: 'clamp(36px, 4.5vw, 56px)',
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          marginLeft: -3,
          marginBottom: 10,
          color: 'var(--ink-1)',
          textWrap: 'balance',
        }}>
          Agents
        </h1>
        <p style={{ fontFamily: 'var(--body)', fontSize: 15, color: 'var(--ink-2)', margin: 0 }}>
          Configure system-prompt templates, tools, and per-org overrides.
        </p>
      </header>

      {/* Hairline below header */}
      <div aria-hidden="true" style={{ height: 1, background: 'var(--rule)', marginBottom: 28 }} />

      {/* ---------------------------------------------------------------- */}
      {/* 2-tab strip                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div
        role="tablist"
        aria-label="Agent sections"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--rule)',
          marginBottom: 32,
        }}
      >
        {SECTIONS.map((section, idx) => {
          const isActive = section === activeSection;
          return (
            <button
              key={section}
              id={`agents-section-tab-${section}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`agents-section-panel-${section}`}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => { tabRefs.current[idx] = el; }}
              onClick={() => setActiveSection(section)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              style={{
                position: 'relative',
                padding: '10px 24px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--body)',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
                transition: 'color 200ms var(--ease)',
              }}
            >
              {SECTION_LABELS[section]}
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: 'var(--ink-1)',
                    borderRadius: '2px 2px 0 0',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Tab panels                                                        */}
      {/* ---------------------------------------------------------------- */}
      {SECTIONS.map((section) => (
        <div
          key={section}
          id={`agents-section-panel-${section}`}
          role="tabpanel"
          aria-labelledby={`agents-section-tab-${section}`}
          hidden={activeSection !== section}
        >
          {activeSection === section && (
            <>
              {configsLoading && (
                <div
                  role="status"
                  aria-label="Loading agent configuration"
                  style={{ fontFamily: 'var(--body)', fontSize: 14, color: 'var(--ink-3)', padding: '32px 0' }}
                >
                  Loading configuration…
                </div>
              )}

              {configsError && !configsLoading && (
                <div
                  role="alert"
                  style={{ fontFamily: 'var(--body)', fontSize: 14, color: 'var(--accent)', padding: '32px 0' }}
                >
                  Failed to load agent configuration.
                </div>
              )}

              {!configsLoading && !configsError && (
                <>
                  <AgentSectionEditor
                    config={activeConfig}
                    idPrefix={`section-${section}`}
                  />

                  <AgentOverridesPanel
                    configs={configs ?? []}
                    section={section}
                    orgs={orgs ?? []}
                    sectionDefault={activeConfig}
                  />
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
