import { useCallback, useRef } from 'react';

export type AgentsTab = 'templates' | 'threads' | 'insights';

const TAB_ORDER: AgentsTab[] = ['templates', 'threads', 'insights'];
const TAB_LABELS: Record<AgentsTab, string> = {
  templates: 'Templates',
  threads: 'Threads',
  insights: 'Insights queue',
};

interface TabStripProps {
  active: AgentsTab;
  onChange: (tab: AgentsTab) => void;
  insightCount: number;
}

/**
 * ARIA tab-list with arrow-key navigation, Home/End support.
 * focus-visible rings provided by the global :focus-visible rule.
 */
export function TabStrip({ active, onChange, insightCount }: TabStripProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      let next: number | null = null;
      if (e.key === 'ArrowRight') next = (idx + 1) % TAB_ORDER.length;
      else if (e.key === 'ArrowLeft')
        next = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = TAB_ORDER.length - 1;

      if (next !== null) {
        e.preventDefault();
        onChange(TAB_ORDER[next]);
        tabRefs.current[next]?.focus();
      }
    },
    [onChange],
  );

  return (
    <div
      role="tablist"
      aria-label="Agents sections"
      style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--rule)',
        marginBottom: 32,
      }}
    >
      {TAB_ORDER.map((tab, idx) => {
        const isActive = tab === active;
        const label =
          tab === 'insights' && insightCount > 0
            ? `${TAB_LABELS[tab]} (${insightCount})`
            : TAB_LABELS[tab];

        return (
          <button
            key={tab}
            id={`agents-tab-${tab}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`agents-panel-${tab}`}
            tabIndex={isActive ? 0 : -1}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            onClick={() => onChange(tab)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            style={{
              position: 'relative',
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'var(--body)',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
              transition: 'color 200ms var(--ease)',
              outline: 'none',
            }}
          >
            {label}
            {/* Active underbar */}
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
            {/* Focus ring — supplemental to :focus-visible */}
            <style>{`
              #agents-tab-${tab}:focus-visible {
                outline: 2px solid var(--accent);
                outline-offset: 2px;
                border-radius: 3px;
              }
            `}</style>
          </button>
        );
      })}
    </div>
  );
}
