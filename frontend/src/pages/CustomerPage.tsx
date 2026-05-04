import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Folder, Settings, Users } from 'lucide-react';
import { useOpenPath } from '../api/useShell';
import { TileGrid, type TileGridItem } from '../components/tiles/TileGrid';
import { useTileLayout, type TileLayout } from '../components/tiles/useTileLayout';
import {
  TileLayoutControls,
  tileActionIconButtonStyle,
} from '../components/tiles/TileLayoutControls';
import { ChatTile } from '../components/tiles/customer/ChatTile';
import { PriorityProjectsTile } from '../components/tiles/customer/PriorityProjectsTile';
import { TasksTile } from '../components/tiles/customer/TasksTile';
import { RecentNotesTile } from '../components/tiles/customer/RecentNotesTile';
import { ContactsTile } from '../components/tiles/customer/ContactsTile';
import { ReferenceTile } from '../components/tiles/customer/ReferenceTile';
import { DocumentsTile } from '../components/tiles/customer/DocumentsTile';
import { OrgTimelineTile } from '../components/tiles/customer/OrgTimelineTile';
import { ProjectNextStepsTile } from '../components/tiles/customer/ProjectNextStepsTile';
import { ProjectResourcesTile } from '../components/tiles/customer/ProjectResourcesTile';
import { MasterNotesTile } from '../components/tiles/customer/MasterNotesTile';
import { ContactQuestionsTile } from '../components/tiles/customer/ContactQuestionsTile';
import { useOrganization } from '../api/useOrganizations';
import { useProjects, useUpdateProject } from '../api/useProjects';
import { CustomerPageHeader } from '../components/customers/CustomerPageHeader';
import { CrossOrgInsightsPanel } from '../components/customers/CrossOrgInsightsPanel';
import { StatusPill } from '../components/shared/StatusPill';
import type { Project, ProjectStatus } from '../types';

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
 * | org-timeline      | 1–12     | 10–14  |
 */
const DEFAULT_CUSTOMER_LAYOUT: TileLayout[] = [
  { id: 'chat',              x: 1,  y: 1,  w: 7,  h: 5 },
  { id: 'priority-projects', x: 8,  y: 1,  w: 5,  h: 3 },
  { id: 'tasks',             x: 8,  y: 4,  w: 5,  h: 2 },
  { id: 'master-notes',      x: 1,  y: 6,  w: 12, h: 4 },
  { id: 'recent-notes',      x: 1,  y: 10, w: 7,  h: 3 },
  { id: 'contacts',          x: 8,  y: 10, w: 5,  h: 2 },
  { id: 'reference',         x: 8,  y: 12, w: 5,  h: 1 },
  { id: 'documents',         x: 1,  y: 13, w: 7,  h: 1 },
  { id: 'cory-questions',    x: 8,  y: 13, w: 5,  h: 2 },
  { id: 'org-timeline',      x: 1,  y: 15, w: 12, h: 5 },
];

const tabStyleBase: CSSProperties = {
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

function CustomerTabs({
  customerId,
  projects,
  activeProjectId,
  projectsLoading,
}: {
  customerId: number;
  projects: Project[];
  activeProjectId: number | null;
  projectsLoading: boolean;
}) {
  const navigate = useNavigate();

  return (
    <div
      role="tablist"
      aria-label="Customer pages"
      style={{
        display: 'flex',
        gap: 0,
        flexWrap: 'wrap',
        rowGap: 4,
        borderBottom: '1px solid var(--rule)',
        marginBottom: 0,
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeProjectId === null}
        onClick={() => navigate(`/customers/${customerId}`)}
        style={{
          ...tabStyleBase,
          fontWeight: activeProjectId === null ? 600 : 400,
          borderBottomColor: activeProjectId === null ? 'var(--ink-1)' : 'transparent',
          color: activeProjectId === null ? 'var(--ink-1)' : 'var(--ink-2)',
        }}
      >
        Home
      </button>

      {projects
        .filter((p) => p.status === 'active' || p.status === 'qualifying')
        .map((project) => {
          const isActive = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => navigate(`/customers/${customerId}/projects/${project.id}`)}
              title={project.name}
              style={{
                ...tabStyleBase,
                fontWeight: isActive ? 600 : 400,
                borderBottomColor: isActive ? 'var(--ink-1)' : 'transparent',
                color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
              }}
            >
              {project.name}
            </button>
          );
        })}

      {projectsLoading && (
        <span
          style={{
            fontFamily: 'var(--body)',
            fontSize: 12,
            color: 'var(--ink-3)',
            padding: '9px 14px',
            whiteSpace: 'nowrap',
          }}
        >
          Loading projects...
        </span>
      )}
    </div>
  );
}

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'qualifying', 'paused', 'won', 'lost', 'closed'];

const projectFieldLabelStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--body)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  marginBottom: 6,
};

const projectFieldStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--rule)',
  borderRadius: 6,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 14,
  lineHeight: 1.5,
  padding: '8px 10px',
  outline: 'none',
};

const projectMetaLabelStyle: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 11,
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 3,
};

const projectActionStyle: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 12,
  fontWeight: 500,
  padding: '7px 12px',
  borderRadius: 6,
  border: '1px solid var(--rule)',
  background: 'var(--bg)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
};

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function ProjectHeaderNote({ project }: { project: Project }) {
  const updateProject = useUpdateProject();
  const [note, setNote] = useState(project.notes_url ?? '');

  useEffect(() => {
    setNote(project.notes_url ?? '');
  }, [project.id, project.notes_url]);

  const isDirty = note !== (project.notes_url ?? '');

  const handleSave = () => {
    if (!isDirty) return;
    updateProject.mutate({ id: project.id, notes_url: normalizeOptional(note) });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
      style={{ display: 'grid', gap: 8 }}
    >
      <textarea
        value={note}
        aria-label={`${project.name} project note`}
        placeholder="Add a project note..."
        rows={2}
        onChange={(event) => setNote(event.target.value)}
        style={{
          ...projectFieldStyle,
          minHeight: 58,
          resize: 'vertical',
          color: note ? 'var(--ink-2)' : 'var(--ink-3)',
        }}
      />
      {isDirty && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={updateProject.isPending}
            style={{
              ...projectActionStyle,
              background: 'var(--bg-2)',
              color: 'var(--ink-1)',
              cursor: updateProject.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {updateProject.isPending ? 'Saving...' : 'Save note'}
          </button>
          <button
            type="button"
            onClick={() => setNote(project.notes_url ?? '')}
            style={projectActionStyle}
          >
            Reset
          </button>
        </div>
      )}
    </form>
  );
}

// ── Project config popover ────────────────────────────────────────────────────

function ProjectConfigPanel({ project }: { project: Project }) {
  const updateProject = useUpdateProject();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [docUrl, setDocUrl] = useState(project.doc_url ?? '');
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync local state when project changes (tab switch)
  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? '');
    setStatus(project.status);
    setDocUrl(project.doc_url ?? '');
  }, [project.id, project.name, project.description, project.status, project.doc_url]);

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

  const trimmedName = name.trim();
  const nameIsValid = trimmedName.length > 0;
  const isDirty =
    trimmedName !== project.name ||
    description !== (project.description ?? '') ||
    status !== project.status ||
    docUrl !== (project.doc_url ?? '');

  const handleSave = () => {
    if (!nameIsValid) return;
    updateProject.mutate({
      id: project.id,
      name: trimmedName,
      description: normalizeOptional(description),
      status,
      doc_url: normalizeOptional(docUrl),
    }, { onSuccess: () => setOpen(false) });
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Project settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          border: '1px solid var(--rule)',
          borderRadius: 6,
          background: 'var(--bg)',
          color: open ? 'var(--ink-1)' : 'var(--ink-3)',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <Settings size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Project settings"
          style={{
            position: 'absolute',
            top: 36,
            right: 0,
            width: 280,
            background: 'var(--bg)',
            border: '1px solid var(--rule)',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
            padding: 18,
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Name */}
          <div>
            <label style={projectFieldLabelStyle} htmlFor="cfg-name">Project name</label>
            <input
              id="cfg-name"
              value={name}
              onChange={e => setName(e.target.value)}
              aria-invalid={!nameIsValid}
              style={{
                ...projectFieldStyle,
                borderColor: nameIsValid ? 'var(--rule)' : 'var(--accent)',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={projectFieldLabelStyle} htmlFor="cfg-description">Description</label>
            <textarea
              id="cfg-description"
              value={description}
              rows={3}
              placeholder="No description"
              onChange={e => setDescription(e.target.value)}
              style={{ ...projectFieldStyle, resize: 'vertical' }}
            />
          </div>

          {/* Status */}
          <div>
            <label style={projectFieldLabelStyle} htmlFor="cfg-status">Status</label>
            <select
              id="cfg-status"
              value={status}
              onChange={e => setStatus(e.target.value as ProjectStatus)}
              style={projectFieldStyle}
            >
              {PROJECT_STATUSES.map(s => (
                <option key={s} value={s} style={{ background: 'var(--bg)', color: 'var(--ink-1)' }}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Folder */}
          <div>
            <label style={projectFieldLabelStyle} htmlFor="cfg-folder">Folder path</label>
            <input
              id="cfg-folder"
              value={docUrl}
              placeholder="Not set"
              onChange={e => setDocUrl(e.target.value)}
              style={{ ...projectFieldStyle, fontFamily: 'var(--mono)', fontSize: 12 }}
            />
          </div>

          {/* Metadata */}
          <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <dt style={projectMetaLabelStyle}>Created</dt>
              <dd style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', fontFamily: 'var(--body)' }}>
                {formatDate(project.created_at)}
              </dd>
            </div>
            <div>
              <dt style={projectMetaLabelStyle}>Updated</dt>
              <dd style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', fontFamily: 'var(--body)' }}>
                {formatDate(project.updated_at)}
              </dd>
            </div>
          </dl>

          {/* Save */}
          <button
            type="button"
            disabled={!isDirty || !nameIsValid || updateProject.isPending}
            onClick={handleSave}
            style={{
              ...projectActionStyle,
              background: isDirty && nameIsValid ? 'var(--bg-2)' : 'var(--bg)',
              color: isDirty && nameIsValid ? 'var(--ink-1)' : 'var(--ink-3)',
              cursor: isDirty && nameIsValid && !updateProject.isPending ? 'pointer' : 'not-allowed',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            {updateProject.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Project page ──────────────────────────────────────────────────────────────

const DEFAULT_PROJECT_LAYOUT: TileLayout[] = [
  { id: 'master-notes',       x: 1, y: 1, w: 12, h: 4 },
  { id: 'recent-notes',       x: 1, y: 5, w: 12, h: 4 },
  { id: 'project-next-steps', x: 1, y: 9, w: 12, h: 3 },
];

function ProjectPage({ project }: { project: Project }) {
  const { mutate: openPath } = useOpenPath();

  const { layout, save, reset, revert, isDirty } = useTileLayout(
    `layout.project.${project.id}`,
    DEFAULT_PROJECT_LAYOUT,
  );

  const [editMode, setEditMode] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const resourcesBtnRef = useRef<HTMLButtonElement>(null);
  const resourcesPanelRef = useRef<HTMLDivElement>(null);

  // Close the WWT Resources popover on outside click / escape.
  useEffect(() => {
    if (!resourcesOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        resourcesPanelRef.current && !resourcesPanelRef.current.contains(e.target as Node) &&
        resourcesBtnRef.current && !resourcesBtnRef.current.contains(e.target as Node)
      ) setResourcesOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setResourcesOpen(false); resourcesBtnRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [resourcesOpen]);

  const handleLayoutSave = () => {
    save(layout, false);
    setEditMode(false);
  };
  const handleLayoutCancel = () => {
    revert();
    setEditMode(false);
  };
  const handleLayoutReset = async () => {
    await reset();
    setEditMode(false);
  };

  const tiles: TileGridItem[] = [
    {
      id: 'master-notes',
      title: 'Master Notes',
      node: (
        <MasterNotesTile
          orgId={project.organization_id}
          projectId={project.id}
        />
      ),
    },
    {
      id: 'recent-notes',
      title: 'Recent Notes',
      node: (
        <RecentNotesTile
          orgId={project.organization_id}
          projectId={project.id}
          captureSource="mastercontrol_project"
        />
      ),
    },
    {
      id: 'project-next-steps',
      title: 'Next Steps',
      node: <ProjectNextStepsTile projectId={project.id} orgId={project.organization_id} />,
    },
  ];

  const iconBtnStyle: CSSProperties = {
    ...tileActionIconButtonStyle,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <TileLayoutControls
        editMode={editMode}
        isDirty={isDirty}
        onStartEdit={() => setEditMode(true)}
        onReset={handleLayoutReset}
        onCancel={handleLayoutCancel}
        onSave={handleLayoutSave}
      >
        <StatusPill status={project.status} />

        {project.doc_url && (
          <button
            type="button"
            aria-label="Open project folder"
            title={project.doc_url}
            onClick={() => openPath(project.doc_url!)}
            style={iconBtnStyle}
          >
            <Folder size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}

        {/* WWT Resources — popover trigger between Folder and Settings */}
        <div style={{ position: 'relative' }}>
          <button
            ref={resourcesBtnRef}
            type="button"
            aria-label="WWT resources on this project"
            aria-expanded={resourcesOpen}
            aria-haspopup="dialog"
            onClick={() => setResourcesOpen((v) => !v)}
            style={{
              ...iconBtnStyle,
              color: resourcesOpen ? 'var(--ink-1)' : 'var(--ink-3)',
            }}
          >
            <Users size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
          {resourcesOpen && (
            <div
              ref={resourcesPanelRef}
              role="dialog"
              aria-label="WWT resources"
              style={{
                position: 'absolute',
                top: 36,
                right: 0,
                width: 360,
                background: 'var(--bg)',
                border: '1px solid var(--rule)',
                borderRadius: 8,
                boxShadow: '0 16px 40px rgba(0, 0, 0, 0.28)',
                padding: 0,
                zIndex: 200,
                overflow: 'hidden',
              }}
            >
              <ProjectResourcesTile projectId={project.id} />
            </div>
          )}
        </div>

        <ProjectConfigPanel project={project} />
      </TileLayoutControls>

      <TileGrid items={tiles} layout={layout} editMode={editMode} onLayoutChange={save} />
    </div>
  );
}

export function CustomerPage() {
  const { id, projectId } = useParams<{ id: string; projectId?: string }>();
  const [searchParams] = useSearchParams();
  const numericId = id ? parseInt(id, 10) : 0;
  const threadParam = searchParams.get('thread');
  const parsedThreadId = threadParam !== null ? Number(threadParam) : undefined;
  const threadId =
    parsedThreadId !== undefined && Number.isInteger(parsedThreadId) && parsedThreadId > 0
      ? parsedThreadId
      : undefined;
  const { data: org, isLoading: orgLoading, isError: orgError, refetch: refetchOrg } = useOrganization(numericId);
  const orgId = org?.id ?? numericId;
  const orgName = org?.name ?? '…';
  const {
    data: projects,
    isLoading: projectsLoading,
    isError: projectsError,
    refetch: refetchProjects,
  } = useProjects(orgId);
  const projectList = projects ?? [];
  const parsedProjectId = projectId ? Number(projectId) : null;
  const activeProjectId =
    parsedProjectId !== null && Number.isInteger(parsedProjectId) && parsedProjectId > 0
      ? parsedProjectId
      : null;
  const activeProject =
    activeProjectId !== null
      ? projectList.find((project) => project.id === activeProjectId) ?? null
      : null;

  const { layout, save, reset, revert, isDirty } = useTileLayout(
    'layout.customer',
    DEFAULT_CUSTOMER_LAYOUT,
  );

  const [editMode, setEditMode] = useState(false);
  const showCoryQuestions =
    orgName.toLowerCase().includes('c.h. robinson') ||
    orgName.toLowerCase().includes('ch robinson');

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
      node: <ChatTile orgId={orgId} orgName={orgName} threadId={threadId} />,
    },
    {
      id: 'priority-projects',
      title: 'Open Projects',
      node: <PriorityProjectsTile orgId={orgId} />,
    },
    {
      id: 'tasks',
      title: 'Tasks',
      node: <TasksTile orgId={orgId} />,
    },
    {
      id: 'master-notes',
      title: 'Master Notes',
      node: <MasterNotesTile orgId={orgId} />,
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
    ...(showCoryQuestions ? [{
      id: 'cory-questions',
      title: 'Questions for Cory',
      node: <ContactQuestionsTile orgId={orgId} contactName="Cory" />,
    }] : []),
    {
      id: 'org-timeline',
      title: 'Notes Timeline',
      node: <OrgTimelineTile orgId={orgId} />,
    },
  ];

  return (
    <div>
      {/* Rich page header */}
      {org ? (
        <CustomerPageHeader
          org={org}
          lastThreadAt={undefined}
          lastNoteAt={undefined}
          tabs={
            <CustomerTabs
              customerId={orgId}
              projects={projectList}
              activeProjectId={activeProjectId}
              projectsLoading={projectsLoading}
            />
          }
          summaryOverride={
            activeProject ? <ProjectHeaderNote project={activeProject} /> : undefined
          }
        />
      ) : (
        /* Skeleton / loading state — minimal inline header while org loads */
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 24,
            marginTop: -10,
            marginBottom: 32,
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
                fontSize: 'clamp(18px, 2.8vw, 42px)',
                lineHeight: 1.02,
                letterSpacing: '-0.02em',
                marginLeft: -3,
                textWrap: 'balance',
              }}
            >
              {orgName}
            </h1>
          </div>
        </div>
      )}

      {activeProjectId === null && (
        <TileLayoutControls
          editMode={editMode}
          isDirty={isDirty}
          onStartEdit={() => setEditMode(true)}
          onReset={handleReset}
          onCancel={handleCancel}
          onSave={handleSave}
        />
      )}

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

      {/* Cross-org insights panel — above tile grid, collapses when empty */}
      {projectsError && !projectsLoading && (
        <div
          role="alert"
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 6,
            padding: '18px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-3)',
            marginBottom: 18,
          }}
        >
          Couldn't load projects -{' '}
          <button
            type="button"
            onClick={() => void refetchProjects()}
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

      {!orgLoading && !orgError && activeProjectId === null && (
        <CrossOrgInsightsPanel orgId={orgId} />
      )}

      {/* Tile grid */}
      {!orgLoading && !orgError && activeProjectId === null && (
        <TileGrid
          items={tiles}
          layout={layout}
          editMode={editMode}
          onLayoutChange={save}
        />
      )}

      {!orgLoading && !orgError && activeProjectId !== null && activeProject && (
        <ProjectPage project={activeProject} />
      )}

      {!orgLoading && !orgError && activeProjectId !== null && !activeProject && !projectsLoading && (
        <div
          role="status"
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 6,
            padding: '32px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-3)',
          }}
        >
          Project not found.
        </div>
      )}
    </div>
  );
}
