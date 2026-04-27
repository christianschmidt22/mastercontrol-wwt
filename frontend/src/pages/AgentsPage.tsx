/**
 * AgentsPage.tsx — Phase 1
 *
 * Agent configuration hub. Four top-level tabs:
 *   • Templates  — system-prompt editor for the customer/oem archetypes
 *                  (sub-strip), plus the per-org overrides panel below.
 *   • Threads    — list of agent conversations across orgs.
 *   • Insights   — review queue for unconfirmed agent_insight notes,
 *                  with an inline accept/dismiss row.
 *   • Delegate   — task input + transcript view for running subagents
 *                  on the user's subscription, with the live cost meter.
 *
 * a11y: ARIA tablist/tab/tabpanel for both the outer tabs (TabStrip)
 * and the inner Customer/OEM section sub-strip in the Templates panel.
 */

import { useCallback, useRef, useState } from 'react';
import { useAgentConfigs } from '../api/useAgentConfigs';
import { useOrganizations } from '../api/useOrganizations';
import { TabStrip, type AgentsTab } from '../components/agents/TabStrip';
import { AgentSectionEditor } from '../components/agents/AgentSectionEditor';
import { AgentOverridesPanel } from '../components/agents/AgentOverridesPanel';
import { ThreadsTab } from '../components/agents/ThreadsTab';
import { InsightsTab } from '../components/agents/InsightsTab';
import { DelegateConsole } from '../components/agents/DelegateConsole';

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentSection = 'customer' | 'oem';

const SECTIONS: AgentSection[] = ['customer', 'oem'];
const SECTION_LABELS: Record<AgentSection, string> = {
  customer: 'Customer agent',
  oem: 'OEM agent',
};

// ─── Templates panel ──────────────────────────────────────────────────────────

function TemplatesPanel() {
  const [activeSection, setActiveSection] = useState<AgentSection>('customer');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const { data: configs, isLoading: configsLoading, isError: configsError } =
    useAgentConfigs();
  const { data: orgs } = useOrganizations();

  const activeConfig = configs?.find(
    (c) => c.section === activeSection && c.organization_id === null,
  );

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
    <>
      {/* Customer / OEM sub-strip */}
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
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
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

      {/* Section panels */}
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
                  style={{
                    fontFamily: 'var(--body)',
                    fontSize: 14,
                    color: 'var(--ink-3)',
                    padding: '32px 0',
                  }}
                >
                  Loading configuration…
                </div>
              )}

              {configsError && !configsLoading && (
                <div
                  role="alert"
                  style={{
                    fontFamily: 'var(--body)',
                    fontSize: 14,
                    color: 'var(--accent)',
                    padding: '32px 0',
                  }}
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
    </>
  );
}

// ─── AgentsPage ───────────────────────────────────────────────────────────────

export function AgentsPage() {
  const [activeTab, setActiveTab] = useState<AgentsTab>('templates');
  const [insightCount, setInsightCount] = useState(0);

  const handleInsightCount = useCallback((n: number) => {
    setInsightCount((prev) => (prev === n ? prev : n));
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px' }}>
      {/* Page header */}
      <header style={{ marginBottom: 32 }}>
        <p
          style={{
            fontFamily: 'var(--body)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
            margin: '0 0 6px',
          }}
        >
          AGENTS
        </p>
        <h1
          style={{
            fontFamily: 'var(--display)',
            fontSize: 'clamp(36px, 4.5vw, 56px)',
            fontWeight: 500,
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            marginLeft: -3,
            marginBottom: 10,
            color: 'var(--ink-1)',
            textWrap: 'balance',
          }}
        >
          Agents
        </h1>
        <p
          style={{
            fontFamily: 'var(--body)',
            fontSize: 15,
            color: 'var(--ink-2)',
            margin: 0,
          }}
        >
          Per-section system-prompt templates, tools, and the insights review
          queue.
        </p>
      </header>

      {/* Hairline below header */}
      <div
        aria-hidden="true"
        style={{ height: 1, background: 'var(--rule)', marginBottom: 28 }}
      />

      {/* Top-level tab strip */}
      <TabStrip
        active={activeTab}
        onChange={setActiveTab}
        insightCount={insightCount}
      />

      {/* Tab panels */}
      <div
        id="agents-panel-templates"
        role="tabpanel"
        aria-labelledby="agents-tab-templates"
        hidden={activeTab !== 'templates'}
      >
        {activeTab === 'templates' && <TemplatesPanel />}
      </div>

      <div
        id="agents-panel-threads"
        role="tabpanel"
        aria-labelledby="agents-tab-threads"
        hidden={activeTab !== 'threads'}
      >
        {activeTab === 'threads' && <ThreadsTab />}
      </div>

      <div
        id="agents-panel-insights"
        role="tabpanel"
        aria-labelledby="agents-tab-insights"
        hidden={activeTab !== 'insights'}
      >
        {activeTab === 'insights' && (
          <InsightsTab onCountChange={handleInsightCount} />
        )}
      </div>

      <div
        id="agents-panel-delegate"
        role="tabpanel"
        aria-labelledby="agents-tab-delegate"
        hidden={activeTab !== 'delegate'}
      >
        {activeTab === 'delegate' && <DelegateConsole />}
      </div>
    </div>
  );
}
