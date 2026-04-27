import { BookOpen, FileText, Folder } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import { request } from '../../../api/http';

interface ScanEntry {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  mtime: string;
}

interface ScanResponse {
  configured: boolean;
  root?: string;
  files?: ScanEntry[];
}

interface OemDocsTileProps {
  orgId: number;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readWithAgent(orgId: number, entry: ScanEntry): void {
  window.dispatchEvent(
    new CustomEvent('mastercontrol:read-document', {
      detail: { orgId, path: entry.path, name: entry.name },
    }),
  );
}

export function OemDocsTile({ orgId }: OemDocsTileProps) {
  const scan = useQuery({
    queryKey: ['oem-documents-scan', { orgId }],
    queryFn: () =>
      request<ScanResponse>('GET', `/api/oem/${orgId}/documents/scan`),
    enabled: orgId > 0,
  });

  const files = scan.data?.files ?? [];

  return (
    <Tile title="Documents">
      {scan.isLoading && (
        <TileEmptyState copy="Scanning OEM document folder..." ariaLive />
      )}

      {scan.isError && (
        <TileEmptyState copy="Document scan failed. Check the OEM folder setting." ariaLive />
      )}

      {!scan.isLoading && !scan.isError && scan.data?.configured === false && (
        <TileEmptyState copy="No OEM folder configured yet." ariaLive />
      )}

      {!scan.isLoading && !scan.isError && scan.data?.configured === true && files.length === 0 && (
        <TileEmptyState copy="No files found in the OEM document folder." ariaLive />
      )}

      {!scan.isLoading && !scan.isError && files.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {files.map((entry) => (
            <li
              key={entry.path}
              title={entry.path}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px minmax(0, 1fr) auto 28px',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
                borderBottom: '1px solid var(--rule)',
              }}
            >
              {entry.kind === 'directory' ? (
                <Folder size={16} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <FileText size={16} strokeWidth={1.5} aria-hidden="true" />
              )}
              <span
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--ink-1)',
                  fontSize: 13,
                }}
              >
                {entry.name}
              </span>
              <span
                style={{
                  color: 'var(--ink-3)',
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatSize(entry.size)}
              </span>
              {entry.kind === 'file' ? (
                <button
                  type="button"
                  onClick={() => { readWithAgent(orgId, entry); }}
                  aria-label={`Read document ${entry.name} with agent`}
                  title="Read document with agent"
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--rule)',
                    borderRadius: 4,
                    color: 'var(--ink-3)',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <BookOpen size={13} strokeWidth={1.5} aria-hidden="true" />
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
