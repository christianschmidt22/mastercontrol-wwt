/**
 * CrossOrgInsightsPanel.test.tsx
 *
 * 5 cases:
 *   1. Renders nothing when there are no cross-org insights (panel collapses)
 *   2. Renders insight rows when data is present
 *   3. Renders source org name on each row
 *   4. Accept button calls confirmMutation
 *   5. Dismiss button calls rejectMutation
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CrossOrgInsightsPanel } from './CrossOrgInsightsPanel';
import type { NoteWithOrg } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ciscoInsight: NoteWithOrg = {
  id: 1,
  organization_id: 5,     // target org (Fairview)
  org_name: 'Cisco',
  org_type: 'oem',
  content: 'Cisco mentioned Fairview needs a storage refresh this quarter.',
  ai_response: null,
  source_path: null,
  file_mtime: null,
  role: 'agent_insight',
  thread_id: 10,
  provenance: { tool: 'record_insight', source_thread_id: 10, source_org_id: 7 },
  confirmed: false,
  created_at: '2026-04-01T12:00:00Z',
};

const netappInsight: NoteWithOrg = {
  ...ciscoInsight,
  id: 2,
  org_name: 'NetApp',
  content: 'NetApp thinks Fairview is evaluating AFF A-series.',
};

// ---------------------------------------------------------------------------
// Hook factories
// ---------------------------------------------------------------------------

function makeCrossOrgHook(data: NoteWithOrg[], isLoading = false) {
  return (_orgId: number, _limit?: number) => ({ data, isLoading });
}

function makeConfirmHook(mutateFn = vi.fn()) {
  return () => ({ mutateAsync: mutateFn, isPending: false });
}

function makeRejectHook(mutateFn = vi.fn()) {
  return () => ({ mutateAsync: mutateFn, isPending: false });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CrossOrgInsightsPanel — empty state', () => {
  it('renders nothing when no insights exist', () => {
    const { container } = render(
      <CrossOrgInsightsPanel
        orgId={5}
        _useCrossOrgInsights={makeCrossOrgHook([])}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while loading with no cached data', () => {
    const { container } = render(
      <CrossOrgInsightsPanel
        orgId={5}
        _useCrossOrgInsights={makeCrossOrgHook([], true)}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('CrossOrgInsightsPanel — data view', () => {
  it('renders the section heading when insights exist', () => {
    render(
      <CrossOrgInsightsPanel
        orgId={5}
        _useCrossOrgInsights={makeCrossOrgHook([ciscoInsight])}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Mentioned by other orgs');
  });

  it('renders source org name on each row', () => {
    render(
      <CrossOrgInsightsPanel
        orgId={5}
        _useCrossOrgInsights={makeCrossOrgHook([ciscoInsight, netappInsight])}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    expect(screen.getByText('Cisco')).toBeInTheDocument();
    expect(screen.getByText('NetApp')).toBeInTheDocument();
  });

  it('renders insight content (line-clamped)', () => {
    render(
      <CrossOrgInsightsPanel
        orgId={5}
        _useCrossOrgInsights={makeCrossOrgHook([ciscoInsight])}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    expect(
      screen.getByText('Cisco mentioned Fairview needs a storage refresh this quarter.'),
    ).toBeInTheDocument();
  });

  it('calls confirm mutation when Accept is clicked', () => {
    const confirmFn = vi.fn().mockResolvedValue(undefined);
    render(
      <CrossOrgInsightsPanel
        orgId={5}
        _useCrossOrgInsights={makeCrossOrgHook([ciscoInsight])}
        _useConfirmInsight={makeConfirmHook(confirmFn)}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /accept insight from cisco/i }));
    expect(confirmFn).toHaveBeenCalledWith({ id: 1, orgId: 5 });
  });

  it('calls reject mutation when Dismiss is clicked', () => {
    const rejectFn = vi.fn().mockResolvedValue(undefined);
    render(
      <CrossOrgInsightsPanel
        orgId={5}
        _useCrossOrgInsights={makeCrossOrgHook([ciscoInsight])}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook(rejectFn)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss insight from cisco/i }));
    expect(rejectFn).toHaveBeenCalledWith({ id: 1, orgId: 5 });
  });
});
