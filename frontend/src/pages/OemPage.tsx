import { useState, type CSSProperties, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { TileGrid, type TileGridItem } from '../components/tiles/TileGrid';
import { useTileLayout, type TileLayout } from '../components/tiles/useTileLayout';
import { ChatTile } from '../components/tiles/customer/ChatTile';
import { AccountChannelTile } from '../components/tiles/oem/AccountChannelTile';
import { OemQuickLinksTile } from '../components/tiles/oem/OemQuickLinksTile';
import { OemDocsTile } from '../components/tiles/oem/OemDocsTile';
import { OemPageHeader } from '../components/oem/OemPageHeader';
import { OemCrossRefsPanel } from '../components/oem/OemCrossRefsPanel';
import type { Organization } from '../types';
import { useOrganizations } from '../api/useOrganizations';

/**
 * Default OEM tile layout.
 * | Tile              | cols   | rows   |
 * |-------------------|--------|--------|
 * | chat              | 1–7    | 1–5    |
 * | team              | 8–12   | 1–3    |
 * | quick-links       | 8–12   | 4–5    |
 * | documents         | 1–12   | 6–7    |
 */
const DEFAULT_OEM_LAYOUT: TileLayout[] = [
  { id: 'chat',        x: 1,  y: 1, w: 7, h: 5 },
  { id: 'team',        x: 8,  y: 1, w: 5, h: 3 },
  { id: 'quick-links', x: 8,  y: 4, w: 5, h: 2 },
  { id: 'documents',   x: 1,  y: 6, w: 12, h: 2 },
];

interface OemDashboardProps {
  org: Organization;
  tabs?: ReactNode;
}

/**
 * OemDashboard — tile grid for a single OEM partner.
 * Shares layout state across all OEM dashboards (one layout.oem setting).
 */
function OemDashboard({ org, tabs }: OemDashboardProps) {
  const [searchParams] = useSearchParams();
  const threadParam = searchParams.get('thread');
  const parsedThreadId = threadParam !== null ? Number(threadParam) : undefined;
  const threadId =
    parsedThreadId !== undefined && Number.isInteger(parsedThreadId) && parsedThreadId > 0
      ? parsedThreadId
      : undefined;
  const { layout, save, reset, revert, isDirty } = useTileLayout(
    'layout.oem',
    DEFAULT_OEM_LAYOUT,
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
      title: `${org.name} Agent`,
      node: <ChatTile orgId={org.id} orgName={org.name} threadId={threadId} />,
    },
    {
      id: 'team',
      title: 'Team',
      node: <AccountChannelTile orgId={org.id} />,
    },
    {
      id: 'quick-links',
      title: 'Quick Links',
      node: <OemQuickLinksTile orgId={org.id} />,
    },
    {
      id: 'documents',
      title: 'Documents',
      node: <OemDocsTile orgId={org.id} />,
    },
  ];

  return (
    <div>
      {/* OEM page header + cross-references — mirrors customer page treatment. */}
      <OemPageHeader org={org} tabs={tabs} />
      <OemCrossRefsPanel orgId={org.id} />

      {/* Section header + edit controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          marginBottom: 20,
        }}
      >
        {editMode ? (
          <>
            <button
              type="button"
              onClick={() => void handleReset()}
              style={secondaryBtnStyle}
            >
              Reset to default
            </button>
            <button type="button" onClick={handleCancel} style={secondaryBtnStyle}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty}
              style={{
                ...secondaryBtnStyle,
                background: isDirty ? 'var(--bg-2)' : 'var(--bg)',
                color: isDirty ? 'var(--ink-1)' : 'var(--ink-3)',
                cursor: isDirty ? 'pointer' : 'default',
              }}
            >
              Save
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            aria-label="Customize OEM tile layout"
            style={{
              ...secondaryBtnStyle,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <LayoutGrid size={14} strokeWidth={1.5} aria-hidden="true" />
            Customize layout
          </button>
        )}
      </div>

      <TileGrid
        items={tiles}
        layout={layout}
        editMode={editMode}
        onLayoutChange={save}
      />
    </div>
  );
}

const secondaryBtnStyle: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 12,
  fontWeight: 500,
  padding: '7px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid var(--rule)',
  background: 'var(--bg)',
  color: 'var(--ink-2)',
  transition: 'background-color 150ms var(--ease), color 150ms var(--ease), border-color 150ms var(--ease)',
};

const oemTabStyleBase: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 13,
  padding: '7px 12px',
  border: 'none',
  borderBottom: '2px solid transparent',
  marginBottom: -1,
  background: 'transparent',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'color 150ms var(--ease), border-color 150ms var(--ease)',
};

function OemTabs({
  oems,
  selectedId,
  onSelect,
}: {
  oems: Organization[];
  selectedId: number | null;
  onSelect: (oemId: number) => void;
}) {
  if (oems.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="OEM partners"
      style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--rule)',
        marginBottom: 0,
        overflowX: 'auto',
      }}
    >
      {oems.map((oem) => {
        const isActive = oem.id === selectedId;
        return (
          <button
            key={oem.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelect(oem.id)}
            title={oem.name}
            style={{
              ...oemTabStyleBase,
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: isActive ? 600 : 400,
              borderBottomColor: isActive ? 'var(--ink-1)' : 'transparent',
              color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
            }}
          >
            {oem.name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * OemPage — tab strip across all OEM organizations + per-org tile dashboard.
 *
 * If an :id param is present, that OEM is selected.
 * If missing, the first OEM is selected.
 * Active tab is reflected in the URL: /oem/:id
 */
export function OemPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const { data: oems, isLoading, isError, refetch } = useOrganizations('oem');

  const oemList = oems ?? [];
  const selectedId = id ? parseInt(id, 10) : (oemList[0]?.id ?? null);
  const selectedOrg = oemList.find((o) => o.id === selectedId) ?? oemList[0];

  const handleTabClick = (oemId: number) => {
    navigate(`/oem/${oemId}`);
  };

  return (
    <div>
      {isLoading && (
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

      {isError && !isLoading && (
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
            onClick={() => void refetch()}
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

      {!isLoading && !isError && oemList.length === 0 && (
        <div
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 6,
            padding: '32px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-2)',
          }}
        >
          No OEM partners yet — add one to get started.
        </div>
      )}

      {selectedOrg && (
        <OemDashboard
          key={selectedOrg.id}
          org={selectedOrg}
          tabs={
            <OemTabs
              oems={oemList}
              selectedId={selectedId}
              onSelect={handleTabClick}
            />
          }
        />
      )}
    </div>
  );
}
