import { FolderOpen } from 'lucide-react';
import { Tile } from '../Tile';

/**
 * OemDocsTile — placeholder for Phase 2 OneDrive folder ingest.
 * No data fetch. Displays a calm informational state per DESIGN.md empty-state rules.
 */
export function OemDocsTile() {
  return (
    <Tile title="Documents">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          height: '100%',
          border: '1px dashed var(--rule)',
          borderRadius: 6,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <FolderOpen
          size={24}
          strokeWidth={1.5}
          aria-hidden="true"
          style={{ color: 'var(--ink-3)' }}
        />
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0 }}>
          Coming Phase&#8239;2 — OneDrive folder ingest
        </p>
        <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: 0 }}>
          Partner documents will sync automatically once OneDrive integration lands.
        </p>
      </div>
    </Tile>
  );
}
