import type { ReactNode, CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import GridLayout, { type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { TileLayout } from './useTileLayout';

export interface TileGridItem {
  id: string;
  title: string;
  node: ReactNode;
}

interface TileGridProps {
  items: TileGridItem[];
  layout: TileLayout[];
  editMode: boolean;
  onLayoutChange: (next: TileLayout[]) => void;
}

const COLS = 12;
const ROW_HEIGHT = 80;
const MARGIN: [number, number] = [14, 14];

/**
 * Convert app-shape ({1-based x,y, hidden}) ↔ react-grid-layout shape (0-based).
 */
function toRgl(layout: TileLayout[], editMode: boolean): LayoutItem[] {
  return layout
    .filter((l) => !l.hidden)
    .map((l): LayoutItem => ({
      i: l.id,
      x: Math.max(0, l.x - 1),
      y: Math.max(0, l.y - 1),
      w: Math.max(1, l.w),
      h: Math.max(1, l.h),
      minW: 2,
      minH: 2,
      static: !editMode,
      isDraggable: editMode,
      isResizable: editMode,
    }));
}

function fromRgl(rgl: Layout, previous: TileLayout[]): TileLayout[] {
  const byId = new Map(previous.map((l) => [l.id, l]));
  const next = rgl.map<TileLayout>((l) => ({
    id: l.i,
    x: l.x + 1,
    y: l.y + 1,
    w: l.w,
    h: l.h,
    hidden: byId.get(l.i)?.hidden,
  }));

  // Preserve any hidden tiles that were filtered out before passing to RGL.
  for (const prev of previous) {
    if (prev.hidden && !next.some((l) => l.id === prev.id)) {
      next.push(prev);
    }
  }
  return next;
}

function layoutsEqual(a: TileLayout[], b: TileLayout[]): boolean {
  if (a.length !== b.length) return false;
  const sortKey = (l: TileLayout) => l.id;
  const sa = [...a].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  const sb = [...b].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  for (let i = 0; i < sa.length; i++) {
    const ai = sa[i]!;
    const bi = sb[i]!;
    if (
      ai.id !== bi.id ||
      ai.x !== bi.x ||
      ai.y !== bi.y ||
      ai.w !== bi.w ||
      ai.h !== bi.h ||
      Boolean(ai.hidden) !== Boolean(bi.hidden)
    )
      return false;
  }
  return true;
}

/**
 * Tracks a parent's clientWidth so we can pass an explicit width to GridLayout
 * (it requires a width prop). We stay off `WidthProvider` to keep SSR-safe and
 * avoid the extra ResizeObserver wrapper.
 */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * TileGrid — dashboard container.
 *
 * Wraps react-grid-layout. Tiles in `items` placed using `layout` (1-based);
 * edit mode unlocks drag-by-tile and corner resize. Collisions push other
 * tiles down (vertical compaction) so growing one never overlaps another.
 *
 * The same grid renderer is used in view and edit modes so customizing,
 * saving, and canceling never changes the visual layout mode.
 */
export function TileGrid({ items, layout, editMode, onLayoutChange }: TileGridProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();

  const rglLayout = useMemo(() => toRgl(layout, editMode), [layout, editMode]);

  const visibleItems = useMemo(() => items.filter((item) => {
    const entry = layout.find((l) => l.id === item.id);
    return !entry?.hidden;
  }), [items, layout]);

  // Stack order on narrow viewports — top-down by row, then left-to-right.
  const handleLayoutChange = (next: Layout) => {
    const merged = fromRgl(next, layout);
    if (!layoutsEqual(merged, layout)) {
      onLayoutChange(merged);
    }
  };

  return (
    <div ref={containerRef} className="tile-grid-wrapper">
      <style>{tileGridCss}</style>

      <GridLayout
        className={`tile-grid${editMode ? ' tile-grid--edit' : ''}`}
        layout={rglLayout}
        gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN }}
        dragConfig={{
          enabled: editMode,
          cancel: 'input,textarea,select,button,a,[data-no-drag]',
        }}
        resizeConfig={{ enabled: editMode, handles: ['se'] }}
        width={width || 1200}
        onLayoutChange={handleLayoutChange}
      >
        {visibleItems.map((item) => (
          <div key={item.id} className="tile-grid-cell">
            <div className="tile-grid-cell-inner">{item.node}</div>
          </div>
        ))}
      </GridLayout>
    </div>
  );
}

const cellInner: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const tileGridCss = `
.tile-grid-wrapper { width: 100%; }

.tile-grid-cell,
.tile-grid-cell .tile-grid-cell-inner {
  height: 100%;
}
.tile-grid-cell .tile-grid-cell-inner { ${cssBlock(cellInner)} }

/* Edit mode: subtle accent ring, never blocks pointer events on the content. */
.tile-grid--edit .tile-grid-cell {
  outline: 1px dashed var(--accent);
  outline-offset: -2px;
  border-radius: 9px;
  cursor: grab;
}
.tile-grid--edit .tile-grid-cell:active {
  cursor: grabbing;
}

/* RGL placeholder (drop target during drag/resize) */
.tile-grid .react-grid-placeholder {
  background: var(--accent) !important;
  opacity: 0.12 !important;
  border-radius: 8px !important;
  transition: transform 160ms var(--ease, ease), opacity 160ms ease !important;
}

/* RGL resize handle — replace the default arrow icon with a discreet caret */
.tile-grid .react-resizable-handle {
  background: none;
  width: 18px;
  height: 18px;
  z-index: 20;
  cursor: se-resize;
}
.tile-grid .react-resizable-handle::after {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 9px;
  height: 9px;
  border-right: 2px solid var(--accent);
  border-bottom: 2px solid var(--accent);
  border-radius: 0 0 2px 0;
  opacity: 0;
  transition: opacity 140ms var(--ease, ease);
}
.tile-grid--edit .react-resizable-handle::after { opacity: 1; }

`;

function cssBlock(style: CSSProperties): string {
  return Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v};`)
    .join('');
}
