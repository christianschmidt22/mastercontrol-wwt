/**
 * TabStrip.test.tsx
 *
 * Tests for the ARIA tab-list component:
 *  - Renders all three tabs with correct ARIA roles/attributes
 *  - Clicking a tab calls onChange
 *  - ArrowRight/ArrowLeft/Home/End keyboard navigation
 *  - Badge count appears on the insights tab
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabStrip } from './TabStrip';
import type { AgentsTab } from './TabStrip';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderStrip(active: AgentsTab = 'templates', insightCount = 0) {
  const onChange = vi.fn();
  render(
    <TabStrip active={active} onChange={onChange} insightCount={insightCount} />,
  );
  return { onChange };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('TabStrip — rendering', () => {
  it('renders a tablist with four tabs', () => {
    renderStrip();
    expect(screen.getByRole('tablist')).toBeDefined();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('marks only the active tab as aria-selected=true', () => {
    renderStrip('threads');
    const tabs = screen.getAllByRole('tab');
    // JSDOM renders aria-selected={true} → "true" and aria-selected={false} → "false"
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    const notSelected = tabs.filter((t) => t.getAttribute('aria-selected') === 'false');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain('Threads');
    expect(notSelected).toHaveLength(3);
  });

  it('active tab has tabIndex=0; inactive tabs have tabIndex=-1', () => {
    renderStrip('insights');
    const tabs = screen.getAllByRole('tab');
    tabs.forEach((tab) => {
      const expected = tab.getAttribute('aria-selected') === 'true' ? '0' : '-1';
      expect(tab.getAttribute('tabindex')).toBe(expected);
    });
  });

  it('shows badge count on insights tab when insightCount > 0', () => {
    renderStrip('templates', 3);
    const insightsTab = screen.getByRole('tab', { name: /insights queue \(3\)/i });
    expect(insightsTab).toBeDefined();
  });

  it('does not show badge when insightCount is 0', () => {
    renderStrip('templates', 0);
    // When insightCount=0, label is exactly "Insights queue" (no parenthetical)
    const insightsTab = screen.getByRole('tab', { name: 'Insights queue' });
    expect(insightsTab).toBeDefined();
    // Tab text should not contain a count
    expect(insightsTab.textContent).not.toMatch(/\(\d+\)/);
  });

  it('each tab has correct aria-controls attribute', () => {
    renderStrip();
    const tabs = screen.getAllByRole('tab');
    const ids = tabs.map((t) => t.getAttribute('aria-controls'));
    expect(ids).toContain('agents-panel-templates');
    expect(ids).toContain('agents-panel-threads');
    expect(ids).toContain('agents-panel-insights');
  });
});

// ---------------------------------------------------------------------------
// Click interaction
// ---------------------------------------------------------------------------

describe('TabStrip — click navigation', () => {
  it('calls onChange with the clicked tab', async () => {
    const { onChange } = renderStrip('templates');
    await userEvent.click(screen.getByRole('tab', { name: 'Threads' }));
    expect(onChange).toHaveBeenCalledWith('threads');
  });

  it('calls onChange with insights when that tab is clicked', async () => {
    const { onChange } = renderStrip('templates');
    await userEvent.click(screen.getByRole('tab', { name: 'Insights queue' }));
    expect(onChange).toHaveBeenCalledWith('insights');
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

describe('TabStrip — keyboard navigation', () => {
  it('ArrowRight moves focus to next tab and calls onChange', async () => {
    const { onChange } = renderStrip('templates');
    const templatesTab = screen.getByRole('tab', { name: 'Templates' });
    await userEvent.click(templatesTab); // focus it
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('threads');
  });

  it('ArrowLeft from first tab wraps to last tab', async () => {
    const { onChange } = renderStrip('templates');
    const templatesTab = screen.getByRole('tab', { name: 'Templates' });
    await userEvent.click(templatesTab);
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('delegate');
  });

  it('ArrowRight from last tab wraps to first tab', async () => {
    const { onChange } = renderStrip('delegate');
    const delegateTab = screen.getByRole('tab', { name: 'Delegate' });
    await userEvent.click(delegateTab);
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('templates');
  });

  it('Home key moves to first tab (templates)', async () => {
    const { onChange } = renderStrip('insights');
    const insightsTab = screen.getByRole('tab', { name: 'Insights queue' });
    await userEvent.click(insightsTab);
    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith('templates');
  });

  it('End key moves to last tab (delegate)', async () => {
    const { onChange } = renderStrip('templates');
    const templatesTab = screen.getByRole('tab', { name: 'Templates' });
    await userEvent.click(templatesTab);
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith('delegate');
  });
});
