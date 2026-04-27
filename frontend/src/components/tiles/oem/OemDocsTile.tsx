import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';

/**
 * OemDocsTile — placeholder for Phase 2 OneDrive folder ingest.
 * No data fetch yet. Empty state per DESIGN.md § Empty states and mockup catalog.
 */
export function OemDocsTile() {
  return (
    <Tile title="Documents">
      <TileEmptyState
        copy="OEM document scan lands in Phase 2 — check back after WorkVault ingest."
        ariaLive
      />
    </Tile>
  );
}
