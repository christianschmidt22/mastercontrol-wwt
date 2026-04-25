import { Tile } from '../Tile';
import type { Project } from '../../../types';

interface UseProjectsResult {
  data: Project[] | undefined;
  isLoading: boolean;
}

/**
 * Stub for the real useProjects hook (built in parallel).
 * Contract: useProjects(orgId) => { data: Project[], isLoading }
 */
function useProjectsStub(_orgId: number): UseProjectsResult {
  return { data: undefined, isLoading: false };
}

interface PriorityProjectsTileProps {
  orgId: number;
  _useProjects?: (orgId: number) => UseProjectsResult;
}

const ACTIVE_STATUSES: Project['status'][] = ['active', 'qualifying'];

/**
 * PriorityProjectsTile — active and qualifying projects for the org.
 *
 * Status pills use --ink-1 text on --bg-2 chip background per Q-1 vermilion budget.
 * No vermilion on status pills.
 */
export function PriorityProjectsTile({ orgId, _useProjects }: PriorityProjectsTileProps) {
  const useProjects = _useProjects ?? useProjectsStub;
  const { data: allProjects, isLoading } = useProjects(orgId);

  const projects = allProjects?.filter((p) => ACTIVE_STATUSES.includes(p.status)) ?? [];

  return (
    <Tile title="Priority Projects" count={isLoading ? '…' : projects.length}>
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && projects.length === 0 && (
        <div
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 6,
            padding: '16px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-2)',
          }}
        >
          No active projects — add one to start tracking.
        </div>
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
