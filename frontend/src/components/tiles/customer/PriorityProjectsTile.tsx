import { useState, useCallback, useId, type FormEvent, type CSSProperties } from 'react';
import { Plus } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Project, ProjectCreate, ProjectStatus } from '../../../types';

// ── Hook interfaces — narrower than UseMutationResult for inject-ability ──────

interface UseProjectsResult {
  data: Project[] | undefined;
  isLoading: boolean;
}

interface UseCreateProjectResult {
  mutate: (data: ProjectCreate, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
}

function useProjectsStub(_orgId: number): UseProjectsResult {
  return { data: undefined, isLoading: false };
}

function useCreateProjectStub(): UseCreateProjectResult {
  return { mutate: () => {}, isPending: false };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PriorityProjectsTileProps {
  orgId: number;
  _useProjects?: (orgId: number) => UseProjectsResult;
  _useCreateProject?: () => UseCreateProjectResult;
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

const ACTIVE_STATUSES: Project['status'][] = ['active', 'qualifying'];

/**
 * PriorityProjectsTile — active and qualifying projects for the org.
 *
 * "+" header button expands an inline add-project form.
 * Status pills use --ink-1 text on --bg-2 chip background per Q-1 vermilion budget.
 */
export function PriorityProjectsTile({
  orgId,
  _useProjects,
  _useCreateProject,
}: PriorityProjectsTileProps) {
  const useProjects = _useProjects ?? useProjectsStub;
  const useCreateProject = _useCreateProject ?? useCreateProjectStub;

  const { data: allProjects, isLoading } = useProjects(orgId);
  const { mutate: createProject, isPending } = useCreateProject();

  const [adding, setAdding] = useState(false);
  const [optimisticProjects, setOptimisticProjects] = useState<Project[]>([]);

  // Form state
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
        {
          organization_id: orgId,
          name,
          status: statusVal,
          description: descVal.trim() || null,
        },
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
          {/* Validation error — cleared on next keystroke */}
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
            <li
              key={proj.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'baseline',
                gap: 12,
                paddingBottom: 10,
                borderBottom: '1px solid var(--rule)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--ink-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={proj.name}
                >
                  {proj.name}
                </div>
                {proj.description && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={proj.description}
                  >
                    {proj.description}
                  </div>
                )}
              </div>

              {/* Status pill — ink-1 text on bg-2 chip, NO vermilion per Q-1 */}
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase' as const,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: 'var(--bg-2)',
                  color: 'var(--ink-1)',
                  whiteSpace: 'nowrap' as const,
                  flexShrink: 0,
                }}
              >
                {proj.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
