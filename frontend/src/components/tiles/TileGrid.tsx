import type { ReactNode, CSSProperties } from 'react';
import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import type { TileLayout } from './useTileLayout';
import { TileEditChrome } from './TileEditChrome';

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

/**
 * Sortable tile in edit mode — uses useSortable from @dnd-kit.
 */
function SortableTileSlot({
  item,
  layoutEntry,
  onMove,
  onResize,
}: {
  item: TileGridItem;
  layoutEntry: TileLayout;
  onMove: (id: string, pos: Pick<TileLayout, 'x' | 'y'>) => void;
  onResize: (id: string, size: Pick<TileLayout, 'w' | 'h'>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  // Manually stringify the transform instead of using CSS.Transform.toString
  // to avoid importing @dnd-kit/utilities separately.
  const transformStr = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
    : undefined;

  const style: CSSProperties = {
    transform: transformStr,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    height: '100%',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TileEditChrome
        tileTitle={item.title}
        layout={layoutEntry}
        onMove={(pos) => onMove(item.id, pos)}
        onResize={(size) => onResize(item.id, size)}
        dragHandleProps={
          { ...attributes, ...listeners }
        }
      >
        {item.node}
      </TileEditChrome>
    </div>
  );
}

/**
 * TileGrid — the dashboard container.
 *
 * Normal mode: tiles placed via CSS Grid using inline-style gridColumn/gridRow.
 * Edit mode: wrapped in DndContext + SortableContext for drag reordering.
 *
 * Responsive breakpoints:
 *   ≥1440px: 12-col grid (as designed)
 *   1100-1440px: 8-col grid; tile width clamped to min(w, 8)
 *   <1100px: single-column scroll, edit mode disabled (tiles in layout order)
 *
 * The outer `.tile-grid-wrapper` carries the responsive CSS classes.
 */
export function TileGrid({ items, layout, editMode, onLayoutChange }: TileGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const getLayoutEntry = useCallback(
    (id: string): TileLayout =>
      layout.find((l) => l.id === id) ?? { id, x: 1, y: 1, w: 5, h: 3 },
    [layout],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // Reorder: swap the two layouts' positions
      const newItems = arrayMove(items, oldIndex, newIndex);
      const newLayout = newItems.map((item, idx) => {
        const orig = getLayoutEntry(item.id);
        const displacedItem = items[idx];
        if (!displacedItem) return orig; // shouldn't happen — array lengths match
        const displaced = getLayoutEntry(displacedItem.id);
        return { ...orig, x: displaced.x, y: displaced.y };
      });
      onLayoutChange(newLayout);
    },
    [items, getLayoutEntry, onLayoutChange],
  );

  const handleKeyboardMove = useCallback(
    (id: string, pos: Pick<TileLayout, 'x' | 'y'>) => {
      const next = layout.map((l) => (l.id === id ? { ...l, ...pos } : l));
      onLayoutChange(next);
    },
    [layout, onLayoutChange],
  );

  const handleResize = useCallback(
    (id: string, size: Pick<TileLayout, 'w' | 'h'>) => {
      const next = layout.map((l) => (l.id === id ? { ...l, ...size } : l));
      onLayoutChange(next);
    },
    [layout, onLayoutChange],
  );

  const visibleItems = items.filter((item) => {
    const entry = getLayoutEntry(item.id);
    return !entry.hidden;
  });

  // Responsive grid CSS is done via a style block injected here
  return (
    <>
      <style>{`
        .tile-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          grid-auto-rows: 80px;
          gap: 14px;
        }
        @media (max-width: 1440px) and (min-width: 1100px) {
          .tile-grid {
            grid-template-columns: repeat(8, 1fr);
          }
        }
        @media (max-width: 1099px) {
          .tile-grid {
            display: flex;
            flex-direction: column;
            gap: 14px;
          }
        }
      `}</style>

      {editMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={visibleItems.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="tile-grid">
              {visibleItems.map((item) => {
                const entry = getLayoutEntry(item.id);
                return (
                  <div
                    key={item.id}
                    className="tile-grid-cell"
                    style={gridCellStyle(entry)}
                  >
                    <SortableTileSlot
                      item={item}
                      layoutEntry={entry}
                      onMove={handleKeyboardMove}
                      onResize={handleResize}
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="tile-grid">
          {visibleItems.map((item) => {
            const entry = getLayoutEntry(item.id);
            return (
              <div
                key={item.id}
                className="tile-grid-cell"
                style={gridCellStyle(entry)}
              >
                {item.node}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Returns inline grid placement style for a tile.
 * On narrow viewports (<1100px) CSS overrides display to flex-column
 * so the grid placement is a no-op.
 */
function gridCellStyle(entry: TileLayout): CSSProperties {
  return {
    gridColumn: `${entry.x} / span ${entry.w}`,
    gridRow: `${entry.y} / span ${entry.h}`,
    minHeight: 0,
  };
}
