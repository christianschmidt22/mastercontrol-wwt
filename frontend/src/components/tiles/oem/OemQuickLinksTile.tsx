import { ExternalLink } from 'lucide-react';
import { Tile } from '../Tile';
import type { Document } from '../../../types';

interface UseDocumentsResult {
  data: Document[] | undefined;
  isLoading: boolean;
}

function useDocumentsStub(_orgId: number): UseDocumentsResult {
  return { data: undefined, isLoading: false };
}

interface OemQuickLinksTileProps {
  orgId: number;
  _useDocuments?: (orgId: number) => UseDocumentsResult;
}

/**
 * OemQuickLinksTile — documents of kind='link' for the OEM partner.
 */
export function OemQuickLinksTile({ orgId, _useDocuments }: OemQuickLinksTileProps) {
  const useDocuments = _useDocuments ?? useDocumentsStub;
  const { data: documents, isLoading } = useDocuments(orgId);

  const links = (documents ?? []).filter((d) => d.kind === 'link');

  return (
    <Tile title="Quick Links" count={isLoading ? '…' : links.length || undefined}>
      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && links.length === 0 && (
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
          No links yet — add a link to start tracking.
        </div>
      )}

      {links.length > 0 && (
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
          {links.map((doc) => (
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
              <ExternalLink
                size={13}
                strokeWidth={1.5}
                aria-hidden="true"
                style={{ color: 'var(--ink-3)', flexShrink: 0 }}
              />
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
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
