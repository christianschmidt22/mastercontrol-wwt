import { useState, useCallback, useId, type FormEvent, type CSSProperties } from 'react';
import { Plus, Trash2, FolderOpen } from 'lucide-react';
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

// ── Hook interfaces — narrower than UseMutationResult for inject-ability ──────

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

// Stubs used only in tests when no hook prop is injected
// ── Props ─────────────────────────────────────────────────────────────────────

interface PriorityProjectsTileProps {
  orgId: number;
  _useProjects?: (orgId: number) => UseProjectsResult;
  _useCreateProject?: () => UseCreateProjectResult;
  _useUpdateProject?: () => UseUpdateProjectResult;
  _useDeleteProject?: () => UseDeleteProjectResult;
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

const ACTIVE_STATUSES: ProjectStatus[] = ['active', 'qualifying'];

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
  const [hovered, setHovered] = useState(false);
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

  const handleCancel = useCallback(() => {
    setExpanded(false);
  }, []);

  const handleSave = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const name = nameVal.trim();
      if (!name) return;
      const docUrl = docUrlVal.trim();
      // Only include doc_url when non-empty; omitting it lets the backend
      // auto-generate the vault path when the stored value is currently null.
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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

      {/* Folder button — visible on hover when doc_url is set */}
      <button
        type="button"
        aria-label="Open project folder"
        onClick={handleOpenFolder}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          borderRadius: 4,
          border: '1px solid var(--rule)',
          background: 'transparent',
          color: 'var(--ink-3)',
          cursor: project.doc_url ? 'pointer' : 'default',
          opacity: hovered && project.doc_url && !isOptimistic ? 1 : 0,
          transition: 'opacity 150ms var(--ease)',
          flexShrink: 0,
        }}
        tabIndex={project.doc_url ? 0 : -1}
      >
        <FolderOpen size={11} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {/* Status pill — ink-1 text on bg-2 chip, NO vermilion per Q-1 */}
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 10,
          background: 'var(--bg-2)',
          color: 'var(--ink-1)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {project.status}
      </span>
    </li>
  );
}

// ── Tile ──────────────────────────────────────────────────────────────────────

/**
 * PriorityProjectsTile — active and qualifying projects for the org.
 *
 * Click any project row to expand an inline edit form with save and delete.
 * "+" header button expands an inline add-project form.
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
    allProjects?.filter((p) => ACTIVE_STATUSES.includes(p.status)) ?? [];
  const activeOptimistic = optimisticProjects.filter((p) =>
    ACTIVE_STATUSES.includes(p.status),
  );
  const projects = [...filteredProjects, ...activeOptimistic];

  return (
    <Tile
      title="Priority Projects"
      count={isLoading ? '…' : projects.length}
      titleAction={
        adding ? undefined : (
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
        )
      }
    >
      {/* ── Inline add form ───────────────────────────────────────────────── */}
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
          <div
            aria-live="polite"
            style={{ fontSize: 12, color: 'var(--accent)', minHeight: 16 }}
          >
            {formError ?? ''}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={nameId} style={fieldLabelCss}>
              Name
            </label>
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
            <label htmlFor={statusId} style={fieldLabelCss}>
              Status
            </label>
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
            <label htmlFor={descId} style={fieldLabelCss}>
              Description
            </label>
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
          copy="No projects on record. Add one when an engagement starts."
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
  );
}
