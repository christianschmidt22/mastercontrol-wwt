import type { CSSProperties, ReactNode } from 'react';
import { LayoutGrid } from 'lucide-react';

interface TileLayoutControlsProps {
  editMode: boolean;
  isDirty: boolean;
  ariaLabel?: string;
  children?: ReactNode;
  onStartEdit: () => void;
  onReset: () => void | Promise<void>;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * Fixed top-right tile layout controls.
 * The customize icon is always the rightmost page action, immediately left of
 * the alert bell. Page-specific actions render to its left.
 */
export function TileLayoutControls({
  editMode,
  isDirty,
  ariaLabel = 'Customize tile layout',
  children,
  onStartEdit,
  onReset,
  onCancel,
  onSave,
}: TileLayoutControlsProps) {
  return (
    <div style={toolbarStyle} aria-label="Page actions">
      {children}

      {editMode && (
        <>
          <button type="button" onClick={() => void onReset()} style={textBtnStyle}>
            Reset
          </button>
          <button type="button" onClick={onCancel} style={textBtnStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty}
            style={{
              ...textBtnStyle,
              cursor: isDirty ? 'pointer' : 'default',
              background: isDirty ? 'var(--bg-2)' : 'var(--bg)',
              color: isDirty ? 'var(--ink-1)' : 'var(--ink-3)',
            }}
          >
            Save
          </button>
        </>
      )}

      <button
        type="button"
        onClick={editMode ? onCancel : onStartEdit}
        aria-label={editMode ? 'Exit layout customization' : ariaLabel}
        aria-pressed={editMode}
        title={editMode ? 'Exit layout customization' : 'Customize layout'}
        style={{
          ...iconBtnStyle,
          color: editMode ? 'var(--accent)' : 'var(--ink-3)',
          borderColor: editMode ? 'var(--accent)' : 'var(--rule)',
          background: editMode ? 'var(--bg-2)' : 'var(--bg)',
        }}
      >
        <LayoutGrid size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}

export const tileActionIconButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  border: '1px solid var(--rule)',
  borderRadius: 6,
  background: 'var(--bg)',
  color: 'var(--ink-3)',
  cursor: 'pointer',
  padding: 0,
};

const toolbarStyle: CSSProperties = {
  position: 'fixed',
  top: 10,
  right: 68,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  zIndex: 500,
};

const textBtnStyle: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 12,
  fontWeight: 500,
  padding: '7px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid var(--rule)',
  background: 'var(--bg)',
  color: 'var(--ink-2)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 30,
  transition: 'background-color 150ms var(--ease), color 150ms var(--ease), border-color 150ms var(--ease)',
};

const iconBtnStyle: CSSProperties = {
  ...tileActionIconButtonStyle,
  transition: 'background-color 150ms var(--ease), color 150ms var(--ease), border-color 150ms var(--ease)',
};
