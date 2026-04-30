/**
 * OutlookMessagesTile — org-scoped recent Outlook messages tile.
 *
 * Shows the 10 most recent messages linked to this org (via mention extraction).
 * Same shape as RecentNotesTile: header with count + refresh action, empty state,
 * and MessageList body.
 */

import { RefreshCw } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import { MessageList } from '../../outlook/MessageList';
import {
  useOutlookMessages,
  useOutlookSyncNow,
} from '../../../api/useOutlook';

interface OutlookMessagesTileProps {
  orgId: number;
}

export function OutlookMessagesTile({ orgId }: OutlookMessagesTileProps) {
  const { data: messages, isLoading } = useOutlookMessages(orgId, 10);
  const { mutate: syncNow, isPending: isSyncing } = useOutlookSyncNow();

  const messageList = messages ?? [];

  return (
    <Tile
      title="Outlook"
      count={isLoading ? '…' : messageList.length || undefined}
      titleAction={
        <button
          type="button"
          aria-label="Sync Outlook messages now"
          onClick={() => syncNow()}
          disabled={isSyncing}
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'transparent',
            border: 'none',
            padding: '2px 4px',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            color: 'var(--ink-3)',
            opacity: isSyncing ? 0.5 : 1,
          }}
        >
          <RefreshCw
            size={12}
            strokeWidth={1.5}
            aria-hidden="true"
            style={{
              animation: isSyncing ? 'spin 1s linear infinite' : undefined,
            }}
          />
        </button>
      }
    >
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && messageList.length === 0 && (
        <TileEmptyState
          copy="No Outlook messages linked to this org yet. Sync to check for new messages."
          actionLabel="Sync now"
          onAction={() => syncNow()}
        />
      )}

      {!isLoading && messageList.length > 0 && (
        <MessageList messages={messageList} />
      )}
    </Tile>
  );
}
