import { Plus } from 'lucide-react';
import type { MouseEventHandler, ReactNode } from 'react';

interface TileEmptyStateProps {
  /** Main descriptive copy — says what is missing and what to do. */
  copy: string;
  /** Optional CTA button label. When provided, onAction must also be provided. */
  actionLabel?: string;
  /** Handler for the CTA button. */
  onAction?: MouseEventHandler<HTMLButtonElement>;
  /**
   * When true the container gets aria-live="polite" so that screen readers
   * announce the empty state once data has loaded from a fetch.
   * Default: false.
   */
  ariaLive?: boolean;
  /** Extra content rendered below the copy (e.g. a custom button). */
  children?: ReactNode;
}

/**
 * TileEmptyState — shared empty-state frame per DESIGN.md § Empty states.
 *
 * Dashed --rule border, 32px padding, centered 14px --ink-2 copy.
 * No decorative SVGs. No vermilion at rest (Q-1 vermilion budget).
 * Reduced-motion: no animation applied here; the rule lives in index.css.
 */
export function TileEmptyState({
  copy,
  actionLabel,
  onAction,
  ariaLive = false,
  children,
}: TileEmptyStateProps) {
  return (
    <div
      role="status"
      aria-live={ariaLive ? 'polite' : undefined}
      style={{
        border: '1px dashed var(--rule)',
        borderRadius: 8,
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 12,
        minHeight: 120,
      }}
    >
      <p
        style={{
          fontSize: 14,
          color: 'var(--ink-2)',
          maxWidth: '40ch',
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {copy}
      </p>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--body)',
            fontSize: 13,
            fontWeight: 500,
            padding: '7px 14px',
            borderRadius: 6,
            cursor: 'pointer',
            border: '1px dashed var(--rule)',
            background: 'transparent',
            color: 'var(--ink-2)',
            lineHeight: 1,
          }}
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          {actionLabel}
        </button>
      )}

      {children}
    </div>
  );
}
