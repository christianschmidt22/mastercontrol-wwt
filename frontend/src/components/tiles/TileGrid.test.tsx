import React, { type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TileGrid, type TileGridItem } from './TileGrid';
import type { TileLayout } from './useTileLayout';

vi.mock('react-grid-layout', async () => {
  const ReactModule = await import('react');
  return {
    default: ({ children, className }: { children: ReactNode; className?: string }) =>
      ReactModule.createElement('div', { className, 'data-testid': 'grid-layout' }, children),
  };
});

let clientWidth = 1024;

class MockResizeObserver {
  observe() {
    // No-op. TileGrid reads clientWidth immediately before observing.
  }

  disconnect() {
    // No-op.
  }
}

const items: TileGridItem[] = [
  { id: 'chat', title: 'Chat', node: <div>Chat tile</div> },
  { id: 'projects', title: 'Projects', node: <div>Projects tile</div> },
];

const layout: TileLayout[] = [
  { id: 'chat', x: 1, y: 1, w: 7, h: 4 },
  { id: 'projects', x: 8, y: 1, w: 5, h: 4 },
];

function renderGrid(editMode = false) {
  const onLayoutChange = vi.fn();
  const view = render(
    <TileGrid
      items={items}
      layout={layout}
      editMode={editMode}
      onLayoutChange={onLayoutChange}
    />,
  );
  return { ...view, onLayoutChange };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clientWidth = 1024;
});

describe('TileGrid layout mode', () => {
  it('uses the grid at desktop-with-sidebar widths in normal mode', async () => {
    clientWidth = 720;
    const { container } = renderGrid(false);

    await waitFor(() => expect(screen.getByTestId('grid-layout')).toBeInTheDocument());

    expect(container.querySelector('.tile-grid-stack')).toBeNull();
    expect(screen.getByTestId('grid-layout')).toHaveClass('tile-grid');
  });

  it('uses the same grid at narrow pane widths in normal mode', async () => {
    clientWidth = 480;
    const { container } = renderGrid(false);

    await waitFor(() => expect(screen.getByTestId('grid-layout')).toBeInTheDocument());

    expect(container.querySelector('.tile-grid-stack')).toBeNull();
    expect(screen.getByTestId('grid-layout')).toHaveClass('tile-grid');
    expect(screen.getByText('Chat tile')).toBeInTheDocument();
    expect(screen.getByText('Projects tile')).toBeInTheDocument();
  });

  it('adds the edit class without changing layout mode', async () => {
    clientWidth = 480;
    const { container } = renderGrid(true);

    await waitFor(() => expect(screen.getByTestId('grid-layout')).toBeInTheDocument());

    expect(container.querySelector('.tile-grid-stack')).toBeNull();
    expect(screen.getByTestId('grid-layout')).toHaveClass('tile-grid--edit');
  });
});
