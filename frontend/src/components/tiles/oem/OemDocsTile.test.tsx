/**
 * OemDocsTile.test.tsx
 *
 * Tests for the OemDocsTile empty-state rendering.
 * This tile has no data fetch — it always renders the empty state.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OemDocsTile } from './OemDocsTile';

describe('OemDocsTile', () => {
  it('renders the empty-state copy', () => {
    render(<OemDocsTile />);
    expect(
      screen.getByText(
        'No documents on record. Open the documents folder to start tracking.',
      ),
    ).toBeInTheDocument();
  });

  it('empty state has role="status"', () => {
    render(<OemDocsTile />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the tile title "Documents"', () => {
    render(<OemDocsTile />);
    // The Tile header renders the title
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });
});
