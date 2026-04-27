/**
 * OemCrossRefsPanel.test.tsx
 *
 * 5 cases:
 *   1. Renders empty state when no insights and not loading
 *   2. Renders nothing while loading with no cached data
 *   3. Renders insight rows with source org name when data present
 *   4. Accept button calls confirm mutation
 *   5. Dismiss button calls reject mutation
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { OemCrossRefsPanel } from './OemCrossRefsPanel';
import type { NoteWithOrg } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fairviewMention: NoteWithOrg = {
  id: 1,
  organization_id: 7,      // target org (Cisco OEM)
  org_name: 'Fairview Health',
  org_type: 'customer',
  content: 'Fairview needs a Cisco C9300 campus switch refresh this Q3.',
  ai_response: null,
  source_path: null,
  file_mtime: null,
  role: 'agent_insight',
  thread_id: 1,
  provenance: { tool: 'record_insight', source_thread_id: 1, source_org_id: 1 },
  confirmed: false,
  created_at: '2026-04-10T09:00:00Z',
};

const chrMention: NoteWithOrg = {
  ...fairviewMention,
  id: 2,
  org_name: 'CHR',
  content: 'CHR is evaluating Cisco UCS for their DR site expansion.',
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

describe('OemCrossRefsPanel — empty state', () => {
  it('renders the empty state when no insights and not loading', () => {
    render(
      <OemCrossRefsPanel
        orgId={7}
        _useCrossOrgInsights={makeCrossOrgHook([])}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    expect(screen.getByText('No customer chatter mentions this OEM yet.')).toBeInTheDocument();
  });

  it('renders nothing while loading with no cached data', () => {
    const { container } = render(
      <OemCrossRefsPanel
        orgId={7}
        _useCrossOrgInsights={makeCrossOrgHook([], true)}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('OemCrossRefsPanel — data view', () => {
  it('renders the section heading when insights exist', () => {
    render(
      <OemCrossRefsPanel
        orgId={7}
        _useCrossOrgInsights={makeCrossOrgHook([fairviewMention])}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Mentioned by customers');
  });

  it('renders source org name on each row', () => {
    render(
      <OemCrossRefsPanel
        orgId={7}
        _useCrossOrgInsights={makeCrossOrgHook([fairviewMention, chrMention])}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    expect(screen.getByText('Fairview Health')).toBeInTheDocument();
    expect(screen.getByText('CHR')).toBeInTheDocument();
  });

  it('calls confirm mutation when Accept is clicked', () => {
    const confirmFn = vi.fn().mockResolvedValue(undefined);
    render(
      <OemCrossRefsPanel
        orgId={7}
        _useCrossOrgInsights={makeCrossOrgHook([fairviewMention])}
        _useConfirmInsight={makeConfirmHook(confirmFn)}
        _useRejectInsight={makeRejectHook()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /accept insight from fairview health/i }));
    expect(confirmFn).toHaveBeenCalledWith({ id: 1, orgId: 7 });
  });

  it('calls reject mutation when Dismiss is clicked', () => {
    const rejectFn = vi.fn().mockResolvedValue(undefined);
    render(
      <OemCrossRefsPanel
        orgId={7}
        _useCrossOrgInsights={makeCrossOrgHook([fairviewMention])}
        _useConfirmInsight={makeConfirmHook()}
        _useRejectInsight={makeRejectHook(rejectFn)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss insight from fairview health/i }));
    expect(rejectFn).toHaveBeenCalledWith({ id: 1, orgId: 7 });
  });
});
