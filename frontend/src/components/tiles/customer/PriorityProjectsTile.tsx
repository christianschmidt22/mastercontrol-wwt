import { useState, useCallback, useId, type FormEvent, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, FolderOpen, Archive, X } from 'lucide-react';
import { useOpenPath, useBrowsePath } from '../../../api/useShell';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Project, ProjectCreate, ProjectUpdate, ProjectStatus } from '../../../types';
import {
  useProjects as useProjectsReal,
  useCreateProject as useCreateProjectReal,
  useUpdateProject as useUpdateProjectReal,
  useDeleteProject as useDeleteProjectReal,
} from '../../../api/useProjects';

// ── Hook interfaces ───────────────────────────────────────────────────────────

interface UseProjectsResult {
  data: Project[] | undefined;
  isLoading: boolean;
}

interface UseCreateProjectResult {
  mutate: (data: ProjectCreate, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
}

interface UseUpdateProjectResult {
  mutate: (data: { id: number } & ProjectUpdate, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
}

interface UseDeleteProjectResult {
  mutate: (data: { id: number; orgId: number }, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PriorityProjectsTileProps {
  orgId: number;
  _useProjects?: (orgId: number) => UseProjectsResult;
  _useCreateProject?: () => UseCreateProjectResult;
  _useUpdateProject?: () => UseUpdateProjectResult;
  _useDeleteProject?: () => UseDeleteProjectResult;
}

// ── Status config ─────────────────────────────────────────────────────────────

/** Statuses shown in the "Open Projects" tile */
const OPEN_STATUSES: ProjectStatus[] = ['active', 'qualifying', 'paused'];

/** Statuses grouped for the "All Projects" modal */
const STATUS_GROUPS: { label: string; statuses: ProjectStatus[] }[] = [
  { label: 'Open', statuses: ['active', 'qualifying', 'paused'] },
  { label: 'Closed', statuses: ['won', 'lost', 'closed'] },
];

function statusColor(status: ProjectStatus): string {
  if (status === 'paused') return '#c2710c';
  return 'var(--ink-1)';
}

function statusBg(status: ProjectStatus): string {
  if (status === 'paused') return 'rgba(194,113,12,0.12)';
  return 'var(--bg-2)';
}

// ── Style constants ───────────────────────────────────────────────────────────

const inputCss: CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 4,
  padding: '5px 8px',
  fontSize: 13,
  background: 'transparent',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  width: '100%',
  boxSizing: 'border-box',
};

const fieldLabelCss: CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-2)',
  fontFamily: 'var(--body)',
};

const iconBtnCss: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 4,
  border: '1px solid var(--rule)',
  background: 'transparent',
  cursor: 'pointer',
  flexShrink: 0,
};

// ── All-Projects modal ────────────────────────────────────────────────────────

function AllProjectsModal({
  orgId,
  projects,
  onClose,
}: {
  orgId: number;
  projects: Project[];
  onClose: () => void;
}) {
  const navigate = useNavigate();

  const handleSelect = (project: Project) => {
    navigate(`/customers/${orgId}/projects/${project.id}`);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="All projects"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: '24px 28px',
          width: 460,
          maxWidth: '92vw',
          maxHeight: '72vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2
            style={{
              fontFamily: 'var(--display)',
              fontSize: 20,
              fontWeight: 500,
              margin: 0,
              color: 'var(--ink-1)',
            }}
          >
            All Projects
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              ...iconBtnCss,
              width: 26,
              height: 26,
              color: 'var(--ink-3)',
            }}
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        {STATUS_GROUPS.map(({ label, statuses }) => {
          const group = projects.filter((p) => statuses.includes(p.status));
          if (group.length === 0) return null;
          return (
            <div key={label} style={{ marginBottom: 20 }}>
              <p
                style={{
                  fontFamily: 'var(--body)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  margin: '0 0 8px',
                }}
              >
                {label}
              </p>
              <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {group.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(project)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid transparent',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 120ms var(--ease)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-2)';
                        e.currentTarget.style.borderColor = 'var(--rule)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: 'var(--body)',
                            fontSize: 13,
                            fontWeight: 500,
                            color: 'var(--ink-1)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {project.name}
                        </div>
                        {project.description && (
                          <div
                            style={{
                              fontFamily: 'var(--body)',
                              fontSize: 11,
                              color: 'var(--ink-3)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: 2,
                            }}
                          >
                            {project.description}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: statusBg(project.status),
                          color: statusColor(project.status),
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          fontFamily: 'var(--body)',
                        }}
                      >
                        {project.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {projects.length === 0 && (
          <p style={{ fontFamily: 'var(--body)', fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
            No projects on record.
          </p>
        )}
      </div>
    </div>
  );
}

// ── ProjectRow ────────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: Project;
  onUpdate: UseUpdateProjectResult['mutate'];
  onDelete: UseDeleteProjectResult['mutate'];
  isUpdating: boolean;
  isDeleting: boolean;
}

function ProjectRow({ project, onUpdate, onDelete, isUpdating, isDeleting }: ProjectRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [nameVal, setNameVal] = useState(project.name);
  const [statusVal, setStatusVal] = useState<ProjectStatus>(project.status);
  const [descVal, setDescVal] = useState(project.description ?? '');
  const [docUrlVal, setDocUrlVal] = useState(project.doc_url ?? '');

  const { mutate: openPath } = useOpenPath();
  const { mutate: browsePath, isPending: isBrowsing } = useBrowsePath();

  const isOptimistic = project.id < 0;

  const handleExpand = useCallback(() => {
    if (isOptimistic) return;
    setNameVal(project.name);
    setStatusVal(project.status);
    setDescVal(project.description ?? '');
    setDocUrlVal(project.doc_url ?? '');
    setExpanded(true);
  }, [isOptimistic, project]);

  const handleCancel = useCallback(() => setExpanded(false), []);

  const handleSave = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const name = nameVal.trim();
      if (!name) return;
      const docUrl = docUrlVal.trim();
      const patch = {
        id: project.id,
        name,
        status: statusVal,
        description: descVal.trim() || null,
        ...(docUrl ? { doc_url: docUrl } : {}),
      };
      onUpdate(patch, { onSuccess: () => setExpanded(false) });
    },
    [nameVal, statusVal, descVal, docUrlVal, project.id, onUpdate],
  );

  const handleDelete = useCallback(() => {
    onDelete({ id: project.id, orgId: project.organization_id });
  }, [project.id, project.organization_id, onDelete]);

  const handleOpenFolder = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const path = expanded ? docUrlVal.trim() : (project.doc_url ?? '');
      if (path) openPath(path);
    },
    [expanded, docUrlVal, project.doc_url, openPath],
  );

  if (expanded) {
    return (
      <li style={{ paddingBottom: 12, borderBottom: '1px solid var(--rule)' }}>
        <form onSubmit={handleSave} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={fieldLabelCss}>Name</label>
            <input
              type="text"
              autoFocus
              autoComplete="off"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              style={inputCss}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={fieldLabelCss}>Status</label>
            <select
              value={statusVal}
              onChange={(e) => setStatusVal(e.target.value as ProjectStatus)}
              style={inputCss}
            >
              <option value="active">Active</option>
              <option value="qualifying">Qualifying</option>
              <option value="paused">Paused</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={fieldLabelCss}>Description</label>
            <textarea
              value={descVal}
              onChange={(e) => setDescVal(e.target.value)}
              rows={2}
              style={{ ...inputCss, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={fieldLabelCss}>Folder</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {docUrlVal ? (
                <div
                  title={docUrlVal}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: 'var(--ink-2)',
                    fontFamily: 'var(--mono, monospace)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {docUrlVal}
                </div>
              ) : (
                <div style={{ flex: 1, fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>
                  No folder set — will auto-generate on save
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label="Browse for folder"
                  disabled={isBrowsing}
                  onClick={() =>
                    browsePath(
                      { orgId: project.organization_id, currentPath: docUrlVal || undefined },
                      { onSuccess: (result) => { if (result.path) setDocUrlVal(result.path); } },
                    )
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    fontSize: 11,
                    border: '1px solid var(--rule)',
                    borderRadius: 4,
                    background: 'transparent',
                    color: 'var(--ink-2)',
                    cursor: isBrowsing ? 'wait' : 'pointer',
                    fontFamily: 'var(--body)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <FolderOpen size={11} strokeWidth={1.5} aria-hidden="true" />
                  {isBrowsing ? 'Browsing…' : 'Browse…'}
                </button>
                {docUrlVal && (
                  <button
                    type="button"
                    aria-label="Open folder in Explorer"
                    onClick={handleOpenFolder}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px 6px',
                      fontSize: 11,
                      border: '1px solid var(--rule)',
                      borderRadius: 4,
                      background: 'transparent',
                      color: 'var(--ink-3)',
                      cursor: 'pointer',
                    }}
                  >
                    Open
                  </button>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              aria-label="Delete project"
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                fontSize: 11,
                border: '1px solid var(--rule)',
                borderRadius: 4,
                background: 'transparent',
                color: 'var(--ink-3)',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              <Trash2 size={11} strokeWidth={1.5} aria-hidden="true" />
              Delete
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  border: '1px solid var(--rule)',
                  borderRadius: 4,
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  cursor: 'pointer',
                  fontFamily: 'var(--body)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdating}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  border: 'none',
                  borderRadius: 4,
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: isUpdating ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--body)',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      onClick={isOptimistic ? undefined : handleExpand}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 10,
        borderBottom: '1px solid var(--rule)',
        cursor: isOptimistic ? 'default' : 'pointer',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--ink-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={project.name}
        >
          {project.name}
        </div>
        {project.description && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={project.description}
          >
            {project.description}
          </div>
        )}
      </div>

      {/* Folder button — always visible when doc_url is set */}
      <button
        type="button"
        aria-label="Open project folder in Explorer"
        onClick={handleOpenFolder}
        disabled={!project.doc_url || isOptimistic}
        title={project.doc_url ? 'Open folder in Explorer' : 'No folder set'}
        style={{
          ...iconBtnCss,
          color: project.doc_url && !isOptimistic ? 'var(--ink-2)' : 'var(--ink-3)',
          opacity: project.doc_url && !isOptimistic ? 1 : 0.25,
          cursor: project.doc_url && !isOptimistic ? 'pointer' : 'default',
        }}
        tabIndex={project.doc_url && !isOptimistic ? 0 : -1}
      >
        <FolderOpen size={11} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {/* Status pill — paused gets amber text */}
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 10,
          background: statusBg(project.status),
          color: statusColor(project.status),
          whiteSpace: 'nowrap',
          flexShrink: 0,
          fontFamily: 'var(--body)',
        }}
      >
        {project.status}
      </span>
    </li>
  );
}

// ── Tile ──────────────────────────────────────────────────────────────────────

/**
 * OpenProjectsTile — active, qualifying, and paused projects for the org.
 *
 * Header: "All projects" button opens a modal showing every project by status
 * (including won/lost/closed). "+ Add project" opens the inline add form.
 *
 * Paused projects render with amber status text. Folder button is always
 * visible when a project has a doc_url set; clicking opens Windows Explorer.
 */
export function PriorityProjectsTile({
  orgId,
  _useProjects,
  _useCreateProject,
  _useUpdateProject,
  _useDeleteProject,
}: PriorityProjectsTileProps) {
  const useProjects = _useProjects ?? useProjectsReal;
  const useCreateProject = _useCreateProject ?? useCreateProjectReal;
  const useUpdateProject = _useUpdateProject ?? useUpdateProjectReal;
  const useDeleteProject = _useDeleteProject ?? useDeleteProjectReal;

  const { data: allProjects, isLoading } = useProjects(orgId);
  const { mutate: createProject, isPending } = useCreateProject();
  const { mutate: updateProject, isPending: isUpdating } = useUpdateProject();
  const { mutate: deleteProject, isPending: isDeleting } = useDeleteProject();

  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [optimisticProjects, setOptimisticProjects] = useState<Project[]>([]);

  const [nameVal, setNameVal] = useState('');
  const [statusVal, setStatusVal] = useState<ProjectStatus>('active');
  const [descVal, setDescVal] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const id = useId();
  const nameId = `${id}-name`;
  const statusId = `${id}-status`;
  const descId = `${id}-desc`;

  const resetForm = useCallback(() => {
    setNameVal('');
    setStatusVal('active');
    setDescVal('');
    setFormError(null);
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    setAdding(false);
  }, [resetForm]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const name = nameVal.trim();
      if (!name) {
        setFormError('Name is required.');
        return;
      }

      const optimistic: Project = {
        id: -Date.now(),
        organization_id: orgId,
        name,
        status: statusVal,
        description: descVal.trim() || null,
        doc_url: null,
        notes_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setOptimisticProjects((prev) => [...prev, optimistic]);

      createProject(
        { organization_id: orgId, name, status: statusVal, description: descVal.trim() || null },
        { onSuccess: () => setOptimisticProjects([]) },
      );

      resetForm();
      setAdding(false);
    },
    [nameVal, statusVal, descVal, orgId, createProject, resetForm],
  );

  const filteredProjects =
    allProjects?.filter((p) => OPEN_STATUSES.includes(p.status)) ?? [];
  const activeOptimistic = optimisticProjects.filter((p) =>
    OPEN_STATUSES.includes(p.status),
  );
  const projects = [...filteredProjects, ...activeOptimistic];

  return (
    <>
      <Tile
        title="Open Projects"
        count={isLoading ? '…' : projects.length}
        titleAction={
          adding ? undefined : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                aria-label="View all projects including closed"
                onClick={() => setShowAll(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'transparent',
                  border: 'none',
                  padding: '2px 4px',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--body)',
                }}
              >
                <Archive size={11} strokeWidth={1.5} aria-hidden="true" />
                All projects
              </button>
              <span style={{ color: 'var(--rule)', fontSize: 12, userSelect: 'none' }}>·</span>
              <button
                type="button"
                aria-label="Add project"
                onClick={() => setAdding(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'transparent',
                  border: 'none',
                  padding: '2px 4px',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--body)',
                }}
              >
                <Plus size={11} strokeWidth={1.5} aria-hidden="true" />
                Add project
              </button>
            </div>
          )
        }
      >
        {/* ── Inline add form ─────────────────────────────────────────────── */}
        {adding && (
          <form
            onSubmit={handleSubmit}
            noValidate
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: projects.length > 0 ? 14 : 0,
            }}
          >
            <div aria-live="polite" style={{ fontSize: 12, color: 'var(--accent)', minHeight: 16 }}>
              {formError ?? ''}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor={nameId} style={fieldLabelCss}>Name</label>
              <input
                id={nameId}
                type="text"
                autoFocus
                autoComplete="off"
                value={nameVal}
                onChange={(e) => {
                  setNameVal(e.target.value);
                  setFormError(null);
                }}
                placeholder="Project name"
                style={inputCss}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor={statusId} style={fieldLabelCss}>Status</label>
              <select
                id={statusId}
                value={statusVal}
                onChange={(e) => setStatusVal(e.target.value as ProjectStatus)}
                style={inputCss}
              >
                <option value="active">Active</option>
                <option value="qualifying">Qualifying</option>
                <option value="paused">Paused</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor={descId} style={fieldLabelCss}>Description</label>
              <textarea
                id={descId}
                value={descVal}
                onChange={(e) => setDescVal(e.target.value)}
                placeholder="Optional — brief context"
                rows={2}
                style={{ ...inputCss, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  border: '1px solid var(--rule)',
                  borderRadius: 4,
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  cursor: 'pointer',
                  fontFamily: 'var(--body)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  border: 'none',
                  borderRadius: 4,
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--body)',
                }}
              >
                Save
              </button>
            </div>
          </form>
        )}

        {isLoading && (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
        )}

        {!isLoading && projects.length === 0 && !adding && (
          <TileEmptyState
            copy="No open projects. Add one when an engagement starts."
            ariaLive
          />
        )}

        {projects.length > 0 && (
          <ul
            role="list"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {projects.map((proj) => (
              <ProjectRow
                key={proj.id}
                project={proj}
                onUpdate={updateProject}
                onDelete={deleteProject}
                isUpdating={isUpdating}
                isDeleting={isDeleting}
              />
            ))}
          </ul>
        )}
      </Tile>

      {showAll && (
        <AllProjectsModal
          orgId={orgId}
          projects={allProjects ?? []}
          onClose={() => setShowAll(false)}
        />
      )}
    </>
  );
}
