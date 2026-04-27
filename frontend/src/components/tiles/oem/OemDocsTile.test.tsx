/**
 * OemDocsTile.test.tsx
 *
 * Tests for the OemDocsTile empty-state rendering.
 * This tile has no data fetch — it always renders the Phase 2 empty state.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OemDocsTile } from './OemDocsTile';

describe('OemDocsTile', () => {
  it('renders the Phase 2 empty-state copy', () => {
    render(<OemDocsTile />);
    expect(
      screen.getByText(
        'OEM document scan lands in Phase 2 — check back after WorkVault ingest.',
      ),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(<OemDocsTile />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the tile title "Documents"', () => {
    render(<OemDocsTile />);
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('does not render the old placeholder copy', () => {
    render(<OemDocsTile />);
    expect(
      screen.queryByText(
        'No documents on record. Open the documents folder to start tracking.',
      ),
    ).toBeNull();
  });
});
