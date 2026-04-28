import { useRef, useState, useCallback, type ReactNode, type HTMLAttributes, type AriaAttributes, type KeyboardEvent, type PointerEvent } from 'react';
import { GripHorizontal } from 'lucide-react';
import type { TileLayout } from './useTileLayout';

// dnd-kit injects a mix of HTML attributes + event listeners.
type DragHandleProps = HTMLAttributes<HTMLElement> & AriaAttributes;

export interface TileEditChromeProps {
  children: ReactNode;
  tileTitle: string;
  layout: TileLayout;
  /** Called when keyboard move commits a new position */
  onMove: (next: Pick<TileLayout, 'x' | 'y'>) => void;
  /** Called when pointer or keyboard resize commits a new size */
  onResize: (next: Pick<TileLayout, 'w' | 'h'>) => void;
  /** Drag handle attributes injected by @dnd-kit useSortable */
  dragHandleProps?: DragHandleProps;
}

/**
 * Edit-mode chrome wrapper around a single tile.
 * Renders dashed accent border, vermilion drag-grip (top-center),
 * resize handle (bottom-right), and a keyboard "Move tile" button.
 *
 * The drag-grip uses props injected by useSortable's listeners/attributes.
 * Keyboard move: Enter activates, ↑↓←→ shift by one cell, Esc cancels, Enter commits.
 * Position changes announce via aria-live="polite".
 */
export function TileEditChrome({
  children,
  tileTitle,
  layout,
  onMove,
  onResize,
  dragHandleProps,
}: TileEditChromeProps) {
  const [moveActive, setMoveActive] = useState(false);
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number }>({
    x: layout.x,
    y: layout.y,
  });
  const announceRef = useRef<HTMLDivElement>(null);
  const moveBtnRef = useRef<HTMLButtonElement>(null);
  const resizeBtnRef = useRef<HTMLButtonElement>(null);

  const announce = useCallback((msg: string) => {
    if (announceRef.current) {
      announceRef.current.textContent = msg;
    }
  }, []);

  const activateMove = useCallback(() => {
    setMoveActive(true);
    setPendingPos({ x: layout.x, y: layout.y });
    announce(`Move mode active. Use arrow keys to move ${tileTitle}. Press Enter to confirm or Escape to cancel.`);
  }, [layout.x, layout.y, tileTitle, announce]);

  const cancelMove = useCallback(() => {
    setMoveActive(false);
    setPendingPos({ x: layout.x, y: layout.y });
    announce(`Move cancelled.`);
    moveBtnRef.current?.focus();
  }, [layout.x, layout.y, announce]);

  const commitMove = useCallback(() => {
    onMove(pendingPos);
    setMoveActive(false);
    announce(`${tileTitle} moved to row ${pendingPos.y}, column ${pendingPos.x}.`);
    moveBtnRef.current?.focus();
  }, [onMove, pendingPos, tileTitle, announce]);

  const handleMoveKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (!moveActive) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activateMove();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setPendingPos((p) => {
            const next = { ...p, y: Math.max(1, p.y - 1) };
            announce(`Row ${next.y}, column ${next.x}`);
            return next;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setPendingPos((p) => {
            const next = { ...p, y: p.y + 1 };
            announce(`Row ${next.y}, column ${next.x}`);
            return next;
          });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setPendingPos((p) => {
            const next = { ...p, x: Math.max(1, p.x - 1) };
            announce(`Row ${next.y}, column ${next.x}`);
            return next;
          });
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPendingPos((p) => {
            const next = { ...p, x: Math.min(12, p.x + 1) };
            announce(`Row ${next.y}, column ${next.x}`);
            return next;
          });
          break;
        case 'Enter':
          e.preventDefault();
          commitMove();
          break;
        case 'Escape':
          e.preventDefault();
          cancelMove();
          break;
        default:
          break;
      }
    },
    [moveActive, activateMove, commitMove, cancelMove, announce],
  );

  const handleResizePointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const grid = e.currentTarget.closest('.tile-grid');
      const computed = grid ? window.getComputedStyle(grid) : null;
      const columnCount = computed?.gridTemplateColumns
        ? computed.gridTemplateColumns.split(' ').filter(Boolean).length
        : 12;
      const gap = computed?.columnGap ? Number.parseFloat(computed.columnGap) || 14 : 14;
      const gridWidth = grid?.clientWidth ?? 0;
      const colWidth =
        columnCount > 0 && gridWidth > 0
          ? (gridWidth - gap * Math.max(0, columnCount - 1)) / columnCount
          : 80;
      const rowHeight = 80;
      const rowGap = computed?.rowGap ? Number.parseFloat(computed.rowGap) || 14 : 14;
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = layout.w;
      const startH = layout.h;
      const maxW = Math.max(1, columnCount - layout.x + 1);

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        const deltaCols = Math.round((moveEvent.clientX - startX) / (colWidth + gap));
        const deltaRows = Math.round((moveEvent.clientY - startY) / (rowHeight + rowGap));
        const nextW = Math.min(maxW, Math.max(1, startW + deltaCols));
        const nextH = Math.max(1, startH + deltaRows);
        onResize({ w: nextW, h: nextH });
        announce(`${tileTitle} resized to ${nextW} columns by ${nextH} rows.`);
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        resizeBtnRef.current?.focus();
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp, { once: true });
    },
    [layout.h, layout.w, layout.x, onResize, tileTitle, announce],
  );

  const handleResizeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const maxW = Math.max(1, 12 - layout.x + 1);
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          onResize({ w: Math.min(maxW, layout.w + 1), h: layout.h });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onResize({ w: Math.max(1, layout.w - 1), h: layout.h });
          break;
        case 'ArrowDown':
          e.preventDefault();
          onResize({ w: layout.w, h: layout.h + 1 });
          break;
        case 'ArrowUp':
          e.preventDefault();
          onResize({ w: layout.w, h: Math.max(1, layout.h - 1) });
          break;
        default:
          break;
      }
    },
    [layout.h, layout.w, layout.x, onResize],
  );

  const { x, y } = pendingPos;

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        border: '1.5px dashed var(--accent)',
        borderRadius: 8,
        background: 'var(--accent-soft)',
      }}
    >
      {/* Drag grip — top-center, vermilion, uses dnd-kit handle props */}
      <div
        {...(dragHandleProps ?? {})}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          cursor: 'grab',
          color: 'var(--accent)',
          lineHeight: 0,
          touchAction: 'none',
        }}
      >
        <GripHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
      </div>

      {/* Keyboard move button — top-right corner */}
      <button
        ref={moveBtnRef}
        type="button"
        onKeyDown={handleMoveKeyDown}
        onClick={moveActive ? commitMove : activateMove}
        aria-label={`Move ${tileTitle}, currently row ${layout.y} column ${layout.x}${moveActive ? ` — move mode active, currently row ${y} column ${x}` : ''}`}
        aria-pressed={moveActive}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 10,
          width: 22,
          height: 22,
          background: moveActive ? 'var(--accent)' : 'var(--bg-2)',
          border: '1px solid var(--rule)',
          borderRadius: 4,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontFamily: 'var(--body)',
          fontWeight: 600,
          color: moveActive ? 'var(--bg)' : 'var(--ink-3)',
          letterSpacing: '0.02em',
          transition: 'background-color 150ms var(--ease), color 150ms var(--ease)',
        }}
      >
        ↕
      </button>

      {/* Resize handle — bottom-right */}
      <button
        ref={resizeBtnRef}
        type="button"
        aria-label={`Resize ${tileTitle}, currently ${layout.w} columns by ${layout.h} rows`}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
        style={{
          position: 'absolute',
          right: 4,
          bottom: 4,
          width: 14,
          height: 14,
          border: 'none',
          borderRight: '2px solid var(--accent)',
          borderBottom: '2px solid var(--accent)',
          cursor: 'nwse-resize',
          zIndex: 10,
          borderRadius: '0 0 2px 0',
          background: 'transparent',
          padding: 0,
        }}
      />

      {/* Aria live region for move announcements */}
      <div
        ref={announceRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
        }}
      />

      {/* Tile content — rendered inside the chrome */}
      <div style={{ height: '100%' }}>{children}</div>
    </div>
  );
}
