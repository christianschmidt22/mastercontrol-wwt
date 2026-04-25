import { useState, useCallback } from 'react';
import { TabStrip } from '../components/agents/TabStrip';
import { TemplatesTab } from '../components/agents/TemplatesTab';
import { ThreadsTab } from '../components/agents/ThreadsTab';
import { InsightsTab } from '../components/agents/InsightsTab';
import type { AgentsTab } from '../components/agents/TabStrip';

export function AgentsPage() {
  const [activeTab, setActiveTab] = useState<AgentsTab>('templates');
  // Track insight count for the tab badge
  const [insightCount, setInsightCount] = useState(0);

  const handleInsightCount = useCallback((n: number) => {
    setInsightCount((prev) => (prev === n ? prev : n));
  }, []);

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '40px 32px',
      }}
    >
      {/* Page header */}
      <header style={{ marginBottom: 32 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
            margin: '0 0 6px',
          }}
        >
          AGENTS
        </p>
        <h1
          style={{
            fontFamily: 'var(--display)',
            fontSize: 56,
            fontWeight: 500,
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            marginLeft: -3,
            marginBottom: 12,
            color: 'var(--ink-1)',
          }}
        >
          Agents
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            margin: 0,
          }}
        >
          Per-section system-prompt templates, tools, and the insights review
          queue.
        </p>
      </header>

      {/* Tab strip */}
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
        {activeTab === 'templates' && <TemplatesTab />}
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
        {/* InsightsTab always mounted to keep insight count current for the badge */}
        <InsightsTab onCountChange={handleInsightCount} />
      </div>
    </div>
  );
}
