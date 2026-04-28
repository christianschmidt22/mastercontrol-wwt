import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { OrgTimelineTile } from '../components/tiles/customer/OrgTimelineTile';
import { useOrganization } from '../api/useOrganizations';
import { useProjects, useUpdateProject } from '../api/useProjects';
import { CustomerPageHeader } from '../components/customers/CustomerPageHeader';
import { CrossOrgInsightsPanel } from '../components/customers/CrossOrgInsightsPanel';
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
  { id: 'recent-notes',      x: 1,  y: 6,  w: 7,  h: 3 },
  { id: 'contacts',          x: 8,  y: 6,  w: 5,  h: 2 },
  { id: 'reference',         x: 8,  y: 8,  w: 5,  h: 1 },
  { id: 'documents',         x: 1,  y: 9,  w: 7,  h: 1 },
  { id: 'org-timeline',      x: 1,  y: 10, w: 12, h: 5 },
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

      {projects.map((project) => {
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

function ProjectPage({ project }: { project: Project }) {
  const updateProject = useUpdateProject();
  const [draft, setDraft] = useState({
    name: project.name,
    status: project.status,
    description: project.description ?? '',
    docUrl: project.doc_url ?? '',
  });

  useEffect(() => {
    setDraft({
      name: project.name,
      status: project.status,
      description: project.description ?? '',
      docUrl: project.doc_url ?? '',
    });
  }, [project.id, project.name, project.status, project.description, project.doc_url]);

  const isDirty =
    draft.name !== project.name ||
    draft.status !== project.status ||
    draft.description !== (project.description ?? '') ||
    draft.docUrl !== (project.doc_url ?? '');

  const nameIsValid = draft.name.trim().length > 0;

  const handleSave = () => {
    if (!isDirty || !nameIsValid) return;
    updateProject.mutate({
      id: project.id,
      name: draft.name.trim(),
      status: draft.status,
      description: normalizeOptional(draft.description),
      doc_url: normalizeOptional(draft.docUrl),
    });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)',
        gap: 18,
        alignItems: 'start',
      }}
    >
      <form
        aria-label={`${project.name} project details`}
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
        style={{ display: 'contents' }}
      >
      <div
        style={{
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: 22,
          background: 'var(--bg)',
        }}
      >
        <label style={projectFieldLabelStyle} htmlFor="project-name">
          Project
        </label>
        <input
          id="project-name"
          value={draft.name}
          onChange={(event) => setDraft((next) => ({ ...next, name: event.target.value }))}
          aria-invalid={!nameIsValid}
          style={{
            ...projectFieldStyle,
            fontFamily: 'var(--display)',
            fontSize: 34,
            lineHeight: 1.08,
            fontWeight: 500,
            padding: '8px 10px 10px',
            borderColor: nameIsValid ? 'var(--rule)' : 'var(--accent)',
          }}
        />
        <label style={{ ...projectFieldLabelStyle, marginTop: 18 }} htmlFor="project-description">
          Description
        </label>
        <textarea
          id="project-description"
          value={draft.description}
          rows={5}
          placeholder="No project description yet."
          onChange={(event) =>
            setDraft((next) => ({ ...next, description: event.target.value }))
          }
          style={{ ...projectFieldStyle, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={!isDirty || !nameIsValid || updateProject.isPending}
            style={{
              ...projectActionStyle,
              background: isDirty && nameIsValid ? 'var(--bg-2)' : 'var(--bg)',
              color: isDirty && nameIsValid ? 'var(--ink-1)' : 'var(--ink-3)',
              cursor:
                isDirty && nameIsValid && !updateProject.isPending ? 'pointer' : 'not-allowed',
            }}
          >
            {updateProject.isPending ? 'Saving...' : 'Save project'}
          </button>
          <button
            type="button"
            onClick={() =>
              setDraft({
                name: project.name,
                status: project.status,
                description: project.description ?? '',
                docUrl: project.doc_url ?? '',
              })
            }
            disabled={!isDirty}
            style={{
              ...projectActionStyle,
              color: isDirty ? 'var(--ink-2)' : 'var(--ink-3)',
              cursor: isDirty ? 'pointer' : 'not-allowed',
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <aside
        aria-label="Project reference"
        style={{
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: 18,
          background: 'var(--bg)',
        }}
      >
        <dl style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}>
          <div>
            <label style={projectFieldLabelStyle} htmlFor="project-status">
              Status
            </label>
            <select
              id="project-status"
              value={draft.status}
              onChange={(event) =>
                setDraft((next) => ({
                  ...next,
                  status: event.target.value as ProjectStatus,
                }))
              }
              style={projectFieldStyle}
            >
              {PROJECT_STATUSES.map((status) => (
                <option
                  key={status}
                  value={status}
                  style={{ background: 'var(--bg)', color: 'var(--ink-1)' }}
                >
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <dt style={projectMetaLabelStyle}>Created</dt>
            <dd style={{ margin: 0, fontFamily: 'var(--body)', fontSize: 13, color: 'var(--ink-1)' }}>
              {formatDate(project.created_at)}
            </dd>
          </div>
          <div>
            <dt style={projectMetaLabelStyle}>Updated</dt>
            <dd style={{ margin: 0, fontFamily: 'var(--body)', fontSize: 13, color: 'var(--ink-1)' }}>
              {formatDate(project.updated_at)}
            </dd>
          </div>
          <div>
            <label style={projectFieldLabelStyle} htmlFor="project-folder">
              Folder
            </label>
            <input
              id="project-folder"
              value={draft.docUrl}
              placeholder="Not set"
              onChange={(event) => setDraft((next) => ({ ...next, docUrl: event.target.value }))}
              style={{ ...projectFieldStyle, fontFamily: 'var(--mono)', fontSize: 12 }}
            />
          </div>
        </dl>
      </aside>
      </form>

      <div style={{ gridColumn: '1 / -1', minHeight: 280 }}>
        <RecentNotesTile
          orgId={project.organization_id}
          projectId={project.id}
          captureSource="mastercontrol_project"
        />
      </div>
    </div>
  );
}

function LayoutToolbar({
  editMode,
  isDirty,
  onStartEdit,
  onReset,
  onCancel,
  onSave,
}: {
  editMode: boolean;
  isDirty: boolean;
  onStartEdit: () => void;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const buttonStyle: CSSProperties = {
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
    transition: 'background-color 150ms var(--ease), color 150ms var(--ease), border-color 150ms var(--ease)',
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
      {editMode ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={onReset} style={buttonStyle}>
            Reset to default
          </button>
          <button type="button" onClick={onCancel} style={buttonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty}
            style={{
              ...buttonStyle,
              cursor: isDirty ? 'pointer' : 'default',
              background: isDirty ? 'var(--bg-2)' : 'var(--bg)',
              color: isDirty ? 'var(--ink-1)' : 'var(--ink-3)',
            }}
          >
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          aria-label="Customize tile layout"
          style={buttonStyle}
        >
          <LayoutGrid size={14} strokeWidth={1.5} aria-hidden="true" />
          Customize layout
        </button>
      )}
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
        </div>
      )}

      {activeProjectId === null && (
        <LayoutToolbar
          editMode={editMode}
          isDirty={isDirty}
          onStartEdit={() => setEditMode(true)}
          onReset={() => void handleReset()}
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
