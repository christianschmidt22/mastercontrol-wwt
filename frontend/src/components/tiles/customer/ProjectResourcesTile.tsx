import { useState, useCallback, type FormEvent, type CSSProperties } from 'react';
import { Plus, X } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import {
  useProjectResources,
  useCreateProjectResource,
  useDeleteProjectResource,
} from '../../../api/useProjectResources';

interface ProjectResourcesTileProps {
  projectId: number;
}

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

const labelCss: CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-2)',
  fontFamily: 'var(--body)',
};

export function ProjectResourcesTile({ projectId }: ProjectResourcesTileProps) {
  const { data: resources, isLoading } = useProjectResources(projectId);
  const createResource = useCreateProjectResource(projectId);
  const deleteResource = useDeleteProjectResource(projectId);

  const [adding, setAdding] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [nameVal, setNameVal] = useState('');
  const [roleVal, setRoleVal] = useState('');
  const [teamVal, setTeamVal] = useState('');

  const resetForm = useCallback(() => {
    setNameVal('');
    setRoleVal('');
    setTeamVal('');
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    setAdding(false);
  }, [resetForm]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const name = nameVal.trim();
      if (!name) return;
      createResource.mutate(
        {
          name,
          role: roleVal.trim() || null,
          team: teamVal.trim() || null,
        },
        { onSuccess: () => { resetForm(); setAdding(false); } },
      );
    },
    [nameVal, roleVal, teamVal, createResource, resetForm],
  );

  const list = resources ?? [];

  return (
    <Tile
      title="WWT Resources"
      count={isLoading ? '…' : list.length || undefined}
      titleAction={
        adding ? undefined : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add WWT resource"
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
            Add
          </button>
        )
      }
    >
      {adding && (
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: list.length > 0 ? 14 : 0 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelCss}>Name</label>
            <input
              type="text"
              autoFocus
              autoComplete="off"
              placeholder="Full name"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              style={inputCss}
              aria-label="Resource name"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <label style={labelCss}>Role</label>
              <input
                type="text"
                autoComplete="off"
                placeholder="e.g. SE, BDM"
                value={roleVal}
                onChange={(e) => setRoleVal(e.target.value)}
                style={inputCss}
                aria-label="Role"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <label style={labelCss}>Team</label>
              <input
                type="text"
                autoComplete="off"
                placeholder="e.g. Overlay"
                value={teamVal}
                onChange={(e) => setTeamVal(e.target.value)}
                style={inputCss}
                aria-label="Team"
              />
            </div>
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
              disabled={createResource.isPending}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: 'none',
                borderRadius: 4,
                background: 'var(--accent)',
                color: '#fff',
                cursor: createResource.isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              Save
            </button>
          </div>
        </form>
      )}

      {isLoading && <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>}

      {!isLoading && list.length === 0 && !adding && (
        <TileEmptyState copy="No WWT resources engaged yet." ariaLive />
      )}

      {list.length > 0 && (
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((resource) => (
            <li
              key={resource.id}
              onMouseEnter={() => setHoveredId(resource.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '6px 0',
                borderBottom: '1px solid var(--rule)',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--ink-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {resource.name}
                </div>
                {(resource.role || resource.team) && (
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                    {[resource.role, resource.team].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label={`Remove ${resource.name}`}
                onClick={() => deleteResource.mutate(resource.id)}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: '1px solid var(--rule)',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--ink-3)',
                  opacity: hoveredId === resource.id ? 1 : 0,
                  transition: 'opacity 150ms var(--ease)',
                }}
                tabIndex={hoveredId === resource.id ? 0 : -1}
              >
                <X size={10} strokeWidth={2} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
