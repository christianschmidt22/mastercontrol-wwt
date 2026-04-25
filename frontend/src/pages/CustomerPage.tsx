import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { TileGrid, type TileGridItem } from '../components/tiles/TileGrid';
import { useTileLayout, type TileLayout } from '../components/tiles/useTileLayout';
import { ChatTile } from '../components/tiles/customer/ChatTile';
import { PriorityProjectsTile } from '../components/tiles/customer/PriorityProjectsTile';
import { TasksTile } from '../components/tiles/customer/TasksTile';
import { RecentNotesTile } from '../components/tiles/customer/RecentNotesTile';
import { ContactsTile } from '../components/tiles/customer/ContactsTile';
import { ReferenceTile } from '../components/tiles/customer/ReferenceTile';
import { DocumentsTile } from '../components/tiles/customer/DocumentsTile';
import { useOrganization } from '../api/useOrganizations';

/**
 * Default 12-col layout per DESIGN.md § Tile dashboard.
 *
 * | Tile              | cols     | rows   |
 * |-------------------|----------|--------|
 * | chat              | 1–7      | 1–5    |
 * | priority-projects | 8–12     | 1–3    |
 * | tasks             | 8–12     | 4–5    |
 * | recent-notes      | 1–7      | 6–8    |
 * | contacts          | 8–12     | 6–7    |
 * | reference         | 8–12     | 8      |
 * | documents         | 1–7      | 9      |
 */
const DEFAULT_CUSTOMER_LAYOUT: TileLayout[] = [
  { id: 'chat',              x: 1,  y: 1, w: 7, h: 5 },
  { id: 'priority-projects', x: 8,  y: 1, w: 5, h: 3 },
  { id: 'tasks',             x: 8,  y: 4, w: 5, h: 2 },
  { id: 'recent-notes',      x: 1,  y: 6, w: 7, h: 3 },
  { id: 'contacts',          x: 8,  y: 6, w: 5, h: 2 },
  { id: 'reference',         x: 8,  y: 8, w: 5, h: 1 },
  { id: 'documents',         x: 1,  y: 9, w: 7, h: 1 },
];

export function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const numericId = id ? parseInt(id, 10) : 0;
  const { data: org, isLoading: orgLoading, isError: orgError, refetch: refetchOrg } = useOrganization(numericId);
  const orgId = org?.id ?? numericId;
  const orgName = org?.name ?? '…';

  const { layout, save, reset, revert, isDirty } = useTileLayout(
    'layout.customer',
    DEFAULT_CUSTOMER_LAYOUT,
  );

  const [editMode, setEditMode] = useState(false);

  const handleSave = () => {
    save(layout, false);
    setEditMode(false);
  };

  const handleCancel = () => {
    revert();
    setEditMode(false);
  };

  const handleReset = async () => {
    await reset();
    setEditMode(false);
  };

  const tiles: TileGridItem[] = [
    {
      id: 'chat',
      title: `${orgName} Agent`,
      node: <ChatTile orgId={orgId} orgName={orgName} />,
    },
    {
      id: 'priority-projects',
      title: 'Priority Projects',
      node: <PriorityProjectsTile orgId={orgId} />,
    },
    {
      id: 'tasks',
      title: 'Tasks',
      node: <TasksTile orgId={orgId} />,
    },
    {
      id: 'recent-notes',
      title: 'Recent Notes',
      node: <RecentNotesTile orgId={orgId} />,
    },
    {
      id: 'contacts',
      title: 'Contacts',
      node: <ContactsTile orgId={orgId} editMode={editMode} />,
    },
    {
      id: 'reference',
      title: 'Reference',
      node: <ReferenceTile orgId={orgId} />,
    },
    {
      id: 'documents',
      title: 'Documents',
      node: <DocumentsTile orgId={orgId} />,
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          marginBottom: 28,
          maxWidth: 1500,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              fontWeight: 500,
              marginBottom: 8,
              fontFamily: 'var(--body)',
            }}
          >
            Customers
          </p>
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontWeight: 500,
              fontSize: 56,
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
              marginLeft: -6,
              textWrap: 'balance',
            }}
          >
            {orgName}
          </h1>
        </div>

        {/* Header actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {editMode ? (
            <>
              <button
                type="button"
                onClick={() => void handleReset()}
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '7px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: '1px solid var(--rule)',
                  background: 'var(--bg)',
                  color: 'var(--ink-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Reset to default
              </button>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '7px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: '1px solid var(--rule)',
                  background: 'var(--bg)',
                  color: 'var(--ink-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty}
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '7px 14px',
                  borderRadius: 6,
                  cursor: isDirty ? 'pointer' : 'default',
                  border: '1px solid var(--rule)',
                  background: isDirty ? 'var(--bg-2)' : 'var(--bg)',
                  color: isDirty ? 'var(--ink-1)' : 'var(--ink-3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'background-color 150ms var(--ease), color 150ms var(--ease)',
                }}
              >
                Save
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              aria-label="Customize tile layout"
              style={{
                fontFamily: 'var(--body)',
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.02em',
                padding: '7px 14px',
                borderRadius: 6,
                cursor: 'pointer',
                border: '1px solid var(--rule)',
                background: 'var(--bg)',
                color: 'var(--ink-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background-color 150ms var(--ease), color 150ms var(--ease), border-color 150ms var(--ease)',
              }}
            >
              <LayoutGrid size={14} strokeWidth={1.5} aria-hidden="true" />
              Customize layout
            </button>
          )}
        </div>
      </div>

      {/* Org loading / error states */}
      {orgLoading && (
        <div
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 6,
            padding: '32px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-3)',
          }}
        >
          Loading…
        </div>
      )}

      {orgError && !orgLoading && (
        <div
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 6,
            padding: '32px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-3)',
          }}
        >
          Couldn't load orgs ·{' '}
          <button
            type="button"
            onClick={() => void refetchOrg()}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-2)',
              fontFamily: 'var(--body)',
              fontSize: 13,
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Tile grid */}
      {!orgLoading && !orgError && (
        <TileGrid
          items={tiles}
          layout={layout}
          editMode={editMode}
          onLayoutChange={save}
        />
      )}
    </div>
  );
}
