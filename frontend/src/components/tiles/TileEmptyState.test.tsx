/**
 * TileEmptyState.test.tsx
 *
 * Unit tests for the shared TileEmptyState component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TileEmptyState } from './TileEmptyState';

describe('TileEmptyState', () => {
  it('renders copy text', () => {
    render(<TileEmptyState copy="Nothing here yet." />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('has role="status" on the container', () => {
    render(<TileEmptyState copy="Nothing here yet." />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not set aria-live by default', () => {
    render(<TileEmptyState copy="Nothing here yet." />);
    const container = screen.getByRole('status');
    expect(container).not.toHaveAttribute('aria-live');
  });

  it('sets aria-live="polite" when ariaLive prop is true', () => {
    render(<TileEmptyState copy="Nothing here yet." ariaLive />);
    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-live', 'polite');
  });

  it('renders action button when actionLabel and onAction are provided', () => {
    const onAction = vi.fn();
    render(
      <TileEmptyState
        copy="No items."
        actionLabel="Add item"
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
  });

  it('calls onAction when the button is clicked', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <TileEmptyState
        copy="No items."
        actionLabel="Add item"
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('does not render a button when actionLabel is omitted', () => {
    render(<TileEmptyState copy="No items." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders children below the copy', () => {
    render(
      <TileEmptyState copy="No items.">
        <span data-testid="child">extra content</span>
      </TileEmptyState>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
