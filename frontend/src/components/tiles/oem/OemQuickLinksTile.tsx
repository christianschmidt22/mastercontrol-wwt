import {
  useState,
  useCallback,
  useId,
  type FormEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { Tile } from '../Tile';
import { TileEmptyState } from '../TileEmptyState';
import type { Document, DocumentCreate } from '../../../types';

// ── Hook interfaces — narrower than UseMutationResult for inject-ability ──────

interface UseDocumentsResult {
  data: Document[] | undefined;
  isLoading: boolean;
}

interface UseCreateDocumentResult {
  mutate: (data: DocumentCreate, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
}

function useDocumentsStub(_orgId: number): UseDocumentsResult {
  return { data: undefined, isLoading: false };
}

function useCreateDocumentStub(): UseCreateDocumentResult {
  return { mutate: () => {}, isPending: false };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface OemQuickLinksTileProps {
  orgId: number;
  _useDocuments?: (orgId: number) => UseDocumentsResult;
  _useCreateDocument?: () => UseCreateDocumentResult;
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

/** Check whether a string is an absolute http/https URL. */
function isValidUrl(val: string): boolean {
  try {
    const url = new URL(val);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * OemQuickLinksTile — documents of kind='link' for the OEM partner.
 *
 * "+" header button expands an inline add-link form.
 * Label (required, ≤200 chars) and URL (required, valid http/https) are validated
 * on submit. Kind is always 'link' — no selector shown.
 */
export function OemQuickLinksTile({
  orgId,
  _useDocuments,
  _useCreateDocument,
}: OemQuickLinksTileProps) {
  const useDocuments = _useDocuments ?? useDocumentsStub;
  const useCreateDocument = _useCreateDocument ?? useCreateDocumentStub;

  const { data: documents, isLoading } = useDocuments(orgId);
  const { mutate: createDocument, isPending } = useCreateDocument();

  const [adding, setAdding] = useState(false);
  const [optimisticLinks, setOptimisticLinks] = useState<Document[]>([]);

  // Form state
  const [labelVal, setLabelVal] = useState('');
  const [urlVal, setUrlVal] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const formId = useId();
  const labelId = `${formId}-lbl`;
  const urlId = `${formId}-url`;

  const isDirty = labelVal.trim() !== '' || urlVal.trim() !== '';

  const resetForm = useCallback(() => {
    setLabelVal('');
    setUrlVal('');
    setFormError(null);
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    setAdding(false);
  }, [resetForm]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLFormElement>) => {
      if (e.key === 'Escape') handleCancel();
    },
    [handleCancel],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const label = labelVal.trim();
      if (!label) {
        setFormError('Label is required.');
        return;
      }
      if (label.length > 200) {
        setFormError('Label must be 200 characters or fewer.');
        return;
      }
      const url = urlVal.trim();
      if (!url) {
        setFormError('URL is required.');
        return;
      }
      if (!isValidUrl(url)) {
        setFormError('URL must be a valid web address (https://…).');
        return;
      }

      const optimistic: Document = {
        id: -Date.now(),
        organization_id: orgId,
        kind: 'link',
        label,
        url_or_path: url,
        source: 'manual',
        created_at: new Date().toISOString(),
      };
      setOptimisticLinks((prev) => [...prev, optimistic]);

      createDocument(
        {
          organization_id: orgId,
          kind: 'link',
          label,
          url_or_path: url,
          source: 'manual',
        },
        { onSuccess: () => setOptimisticLinks([]) },
      );

      resetForm();
      setAdding(false);
    },
    [labelVal, urlVal, orgId, createDocument, resetForm],
  );

  const serverLinks = (documents ?? []).filter((d) => d.kind === 'link');
  const links = [...serverLinks, ...optimisticLinks];

  return (
    <Tile
      title="Quick Links"
      count={isLoading ? '…' : links.length || undefined}
      titleAction={
        adding ? undefined : (
          <button
            type="button"
            aria-label="Add link"
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
            Add link
          </button>
        )
      }
    >
      {/* ── Inline add form ───────────────────────────────────────────────── */}
      {adding && (
        <form
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          noValidate
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: links.length > 0 ? 14 : 0,
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
            <label htmlFor={labelId} style={fieldLabelCss}>
              Label
            </label>
            <input
              id={labelId}
              type="text"
              autoFocus
              autoComplete="off"
              value={labelVal}
              onChange={(e) => {
                setLabelVal(e.target.value);
                setFormError(null);
              }}
              placeholder="e.g. Cisco Partner Portal"
              style={inputCss}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={urlId} style={fieldLabelCss}>
              URL
            </label>
            <input
              id={urlId}
              type="url"
              autoComplete="off"
              value={urlVal}
              onChange={(e) => {
                setUrlVal(e.target.value);
                setFormError(null);
              }}
              placeholder="https://…"
              style={inputCss}
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
                border: isDirty ? 'none' : '1px solid var(--rule)',
                borderRadius: 4,
                background: isDirty ? 'var(--accent)' : 'transparent',
                color: isDirty ? '#fff' : 'var(--ink-3)',
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

      {!isLoading && links.length === 0 && !adding && (
        <TileEmptyState
          copy="No links yet — add a link to start tracking."
          ariaLive
        />
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
