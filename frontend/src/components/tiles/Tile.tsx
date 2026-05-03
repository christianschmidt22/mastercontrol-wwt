import type { ReactNode } from 'react';

export interface TileProps {
  title: ReactNode;
  count?: number | string;
  titleAction?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Base tile card; purely presentational. Edit-mode chrome is applied externally
 * via TileEditChrome wrapper. Focus-visible ring comes from the global :focus-visible
 * rule in index.css.
 *
 * Header: 13px Switzer SemiBold, optional dot+count, trailing icon-button slot.
 * Body: full-flex remainder of the card height.
 */
export function Tile({ title, count, titleAction, children, className }: TileProps) {
  return (
    <article
      className={className}
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 8,
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
        position: 'relative',
        transition: 'border-color 200ms var(--ease)',
      }}
    >
      {/* Header row */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 18px 10px',
          borderBottom: '1px solid var(--rule)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink-1)',
            fontFamily: 'var(--body)',
            letterSpacing: '0.01em',
            minWidth: 0,
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          {count !== undefined && (
            <span
              aria-label={`${count} items`}
              style={{
                fontSize: 12,
                fontWeight: 400,
                color: 'var(--ink-3)',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {count}
            </span>
          )}
        </div>

        {/* Trailing icon-button slot */}
        {titleAction && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            {titleAction}
          </div>
        )}
      </header>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 18px 18px',
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </article>
  );
}
