import { useState, useCallback, useId, type FormEvent, type CSSProperties } from 'react';
import { ExternalLink, FileText, Plus } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Document, DocumentCreate } from '../../../types';

// ---------------------------------------------------------------------------
// Hook interfaces — narrower than UseMutationResult for inject-ability
// ---------------------------------------------------------------------------

interface UseDocumentsResult {
  data: Document[] | undefined;
  isLoading: boolean;
}

interface UseCreateDocumentResult {
  mutate: (data: DocumentCreate) => void;
  isPending: boolean;
}

function useDocumentsStub(_orgId: number): UseDocumentsResult {
  return { data: undefined, isLoading: false };
}

function useCreateDocumentStub(): UseCreateDocumentResult {
  return { mutate: () => {}, isPending: false };
}

interface DocumentsTileProps {
  orgId: number;
  _useDocuments?: (orgId: number) => UseDocumentsResult;
  _useCreateDocument?: () => UseCreateDocumentResult;
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

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

/**
 * DocumentsTile — compact list of links and file paths for the org.
 * Inline "+ Add document" form opens in the tile body; no modal.
 */
export function DocumentsTile({ orgId, _useDocuments, _useCreateDocument }: DocumentsTileProps) {
  const useDocuments = _useDocuments ?? useDocumentsStub;
  const useCreateDocument = _useCreateDocument ?? useCreateDocumentStub;

  const { data: documents, isLoading } = useDocuments(orgId);
  const { mutate: createDocument, isPending } = useCreateDocument();

  const [adding, setAdding] = useState(false);
  const [labelVal, setLabelVal] = useState('');
  const [urlOrPath, setUrlOrPath] = useState('');
  const [kind, setKind] = useState<'link' | 'file'>('link');
  const [formError, setFormError] = useState<string | null>(null);

  const formId = useId();
  const labelId = `${formId}-lbl`;
  const urlId = `${formId}-url`;
  const kindId = `${formId}-kind`;

  const resetForm = useCallback(() => {
    setLabelVal('');
    setUrlOrPath('');
    setKind('link');
    setFormError(null);
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    setAdding(false);
  }, [resetForm]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!labelVal.trim()) {
        setFormError('Label is required.');
        return;
      }
      if (!urlOrPath.trim()) {
        setFormError('URL or path is required.');
        return;
      }
      if (urlOrPath.length > 1000) {
        setFormError('URL or path must be 1,000 characters or fewer.');
        return;
      }
      createDocument({
        organization_id: orgId,
        kind,
        label: labelVal.trim(),
        url_or_path: urlOrPath.trim(),
      });
      resetForm();
      setAdding(false);
    },
    [labelVal, urlOrPath, kind, orgId, createDocument, resetForm],
  );

  const docList = documents ?? [];

  return (
    <Tile
      title="Documents"
      count={isLoading ? '…' : docList.length || undefined}
      titleAction={
        adding ? undefined : (
          <button
            type="button"
            aria-label="Add document"
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
            Add document
          </button>
        )
      }
    >
      {/* Inline add form */}
      {adding && (
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: docList.length > 0 ? 14 : 0,
          }}
        >
          {/* aria-live error region — clears on next keystroke */}
          <div aria-live="polite" style={{ fontSize: 12, color: 'var(--accent)', minHeight: 16 }}>
            {formError ?? ''}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={labelId} style={fieldLabelCss}>
              Label
            </label>
            <input
              id={labelId}
              type="text"
              autoFocus
              autoComplete="off"
              value={labelVal}
              onChange={(e) => { setLabelVal(e.target.value); setFormError(null); }}
              placeholder="e.g. Fairview SharePoint"
              style={inputCss}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={urlId} style={fieldLabelCss}>
              URL or path
            </label>
            <input
              id={urlId}
              type="text"
              autoComplete="off"
              value={urlOrPath}
              onChange={(e) => { setUrlOrPath(e.target.value); setFormError(null); }}
              placeholder="https://… or C:\path\to\file"
              style={inputCss}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={kindId} style={fieldLabelCss}>
              Kind
            </label>
            <select
              id={kindId}
              value={kind}
              onChange={(e) => setKind(e.target.value as 'link' | 'file')}
              style={inputCss}
            >
              <option value="link">Link</option>
              <option value="file">File</option>
            </select>
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

      {!isLoading && docList.length === 0 && !adding && (
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
