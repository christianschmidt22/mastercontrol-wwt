import { ExternalLink, FileText } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Document } from '../../../types';

interface UseDocumentsResult {
  data: Document[] | undefined;
  isLoading: boolean;
}

function useDocumentsStub(_orgId: number): UseDocumentsResult {
  return { data: undefined, isLoading: false };
}

interface DocumentsTileProps {
  orgId: number;
  _useDocuments?: (orgId: number) => UseDocumentsResult;
}

/**
 * DocumentsTile — compact list of links and file paths for the org.
 */
export function DocumentsTile({ orgId, _useDocuments }: DocumentsTileProps) {
  const useDocuments = _useDocuments ?? useDocumentsStub;
  const { data: documents, isLoading } = useDocuments(orgId);

  const docList = documents ?? [];

  return (
    <Tile title="Documents" count={isLoading ? '…' : docList.length || undefined}>
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && docList.length === 0 && (
        <TileEmptyState
          copy="No documents yet — add a link to start tracking."
          ariaLive
        />
      )}

      {docList.length > 0 && (
        <ul
          role="list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {docList.map((doc) => (
            <li
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
                borderBottom: '1px solid var(--rule)',
              }}
            >
              <span style={{ color: 'var(--ink-3)', flexShrink: 0 }} aria-hidden="true">
                {doc.kind === 'link' ? (
                  <ExternalLink size={14} strokeWidth={1.5} />
                ) : (
                  <FileText size={14} strokeWidth={1.5} />
                )}
              </span>

              {doc.kind === 'link' ? (
                <a
                  href={doc.url_or_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 13,
                    color: 'var(--ink-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    textDecoration: 'none',
                  }}
                  title={doc.url_or_path}
                >
                  {doc.label || doc.url_or_path}
                </a>
              ) : (
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                  title={doc.url_or_path}
                  translate="no"
                >
                  {doc.label || doc.url_or_path}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
