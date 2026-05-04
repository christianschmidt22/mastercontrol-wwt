import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { TileGrid, type TileGridItem } from '../components/tiles/TileGrid';
import { useTileLayout, type TileLayout } from '../components/tiles/useTileLayout';
import {
  TileLayoutControls,
  tileActionIconButtonStyle,
} from '../components/tiles/TileLayoutControls';
import { ChatTile } from '../components/tiles/customer/ChatTile';
import { AccountChannelTile } from '../components/tiles/oem/AccountChannelTile';
import { OemQuickLinksTile } from '../components/tiles/oem/OemQuickLinksTile';
import { OemDocsTile } from '../components/tiles/oem/OemDocsTile';
import { OemPageHeader } from '../components/oem/OemPageHeader';
import { OemCrossRefsPanel } from '../components/oem/OemCrossRefsPanel';
import type { Organization } from '../types';
import { useOrganizations, useUpdateOrganization } from '../api/useOrganizations';

// ── OEM settings popover styles ──────────────────────────────────────────────

const oemFieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'var(--ink-3)',
  display: 'block',
  marginBottom: 6,
};

const oemFieldStyle: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 13,
  color: 'var(--ink-1)',
  background: 'var(--bg)',
  border: '1px solid var(--rule)',
  borderRadius: 4,
  padding: '6px 8px',
  width: '100%',
  boxSizing: 'border-box' as const,
  outline: 'none',
};

// ── OEM settings popover ─────────────────────────────────────────────────────

function OemSettingsPopover({ org }: { org: Organization }) {
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState(
    typeof org.metadata?.onedrive_folder === 'string' ? org.metadata.onedrive_folder : '',
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const updateOrg = useUpdateOrganization();

  // Sync local state when org changes (tab switch)
  useEffect(() => {
    setFolder(
      typeof org.metadata?.onedrive_folder === 'string' ? org.metadata.onedrive_folder : '',
    );
  }, [org.id, org.metadata]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const currentFolder = typeof org.metadata?.onedrive_folder === 'string'
    ? org.metadata.onedrive_folder
    : '';
  const isDirty = folder !== currentFolder;

  const handleSave = () => {
    updateOrg.mutate(
      { id: org.id, metadata: { ...org.metadata, onedrive_folder: folder || null } },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="OEM settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        style={iconBtnStyle}
      >
        <Settings size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="OEM settings"
          style={{
            position: 'absolute',
            top: 36,
            right: 0,
            width: 300,
            background: 'var(--bg)',
            border: '1px solid var(--rule)',
            borderRadius: 8,
            padding: 18,
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div>
            <label style={oemFieldLabelStyle} htmlFor="oem-cfg-folder">
              OneDrive Folder
            </label>
            <input
              id="oem-cfg-folder"
              value={folder}
              placeholder={`C:\\Users\\...\\OneDrive\\Documents\\...`}
              onChange={(e) => setFolder(e.target.value)}
              style={{ ...oemFieldStyle, fontFamily: 'var(--mono, monospace)', fontSize: 12 }}
            />
          </div>

          <button
            type="button"
            disabled={!isDirty || updateOrg.isPending}
            onClick={handleSave}
            style={{
              fontFamily: 'var(--body)',
              fontSize: 12,
              fontWeight: 500,
              padding: '7px 12px',
              borderRadius: 6,
              cursor: isDirty && !updateOrg.isPending ? 'pointer' : 'not-allowed',
              border: '1px solid var(--rule)',
              background: isDirty ? 'var(--bg-2)' : 'var(--bg)',
              color: isDirty ? 'var(--ink-1)' : 'var(--ink-3)',
              width: '100%',
            }}
          >
            {updateOrg.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}

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

      <TileLayoutControls
        editMode={editMode}
        isDirty={isDirty}
        ariaLabel="Customize OEM tile layout"
        onStartEdit={() => setEditMode(true)}
        onReset={handleReset}
        onCancel={handleCancel}
        onSave={handleSave}
      >
        <OemSettingsPopover org={org} />
      </TileLayoutControls>

      <TileGrid
        items={tiles}
        layout={layout}
        editMode={editMode}
        onLayoutChange={save}
      />
    </div>
  );
}

const iconBtnStyle: CSSProperties = {
  ...tileActionIconButtonStyle,
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

function formatOemTabLabel(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes('dell')) return 'Dell';
  if (normalized.includes('pure')) return 'Pure';
  return name;
}

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
        flexWrap: 'wrap',
        rowGap: 4,
        borderBottom: '1px solid var(--rule)',
        marginBottom: 0,
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
              fontWeight: isActive ? 600 : 400,
              borderBottomColor: isActive ? 'var(--ink-1)' : 'transparent',
              color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
            }}
          >
            {formatOemTabLabel(oem.name)}
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
