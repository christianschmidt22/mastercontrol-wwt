import { useState, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import { Tile } from '../Tile';
import {
  useMasterNoteEditor,
  useProcessMasterNote,
} from '../../../api/useMasterNotes';
import { MarkdownViewer } from '../../shared/MarkdownViewer';

interface MasterNotesTileProps {
  orgId: number;
  projectId?: number | null;
}

const textareaStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  minHeight: 220,
  border: '1px solid var(--rule)',
  borderRadius: 6,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--mono)',
  fontSize: 13,
  lineHeight: 1.55,
  padding: '12px 14px',
  boxSizing: 'border-box',
  outline: 'none',
  resize: 'vertical',
};

const statusCopy: Record<'idle' | 'saving' | 'saved' | 'error', string> = {
  idle: 'Autosave on',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed — retry by editing',
};

const statusColor: Record<'idle' | 'saving' | 'saved' | 'error', string> = {
  idle: 'var(--ink-3)',
  saving: 'var(--ink-3)',
  saved: 'var(--ink-3)',
  error: 'var(--accent)',
};

/**
 * Free-form master note tile — one bound textarea per (org, optional project).
 * Autosaves every 600ms of idle typing. The "Process now" button kicks the
 * extraction pipeline against the current content so any new tasks /
 * customer-asks / OEM mentions land in the approvals queue right away.
 */
type EditorTab = 'edit' | 'preview';

export function MasterNotesTile({ orgId, projectId = null }: MasterNotesTileProps) {
  const editor = useMasterNoteEditor({ orgId, projectId });
  const process = useProcessMasterNote();
  const [activeTab, setActiveTab] = useState<EditorTab>('edit');

  const status = editor.status;

  const lastIngestedLabel = editor.lastIngestedAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(editor.lastIngestedAt))
    : null;

  const tabBtnStyle = (tab: EditorTab): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid var(--rule)',
    background: activeTab === tab ? 'var(--bg-2)' : 'transparent',
    color: activeTab === tab ? 'var(--ink-1)' : 'var(--ink-3)',
    borderRadius: 3,
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--body)',
    fontWeight: activeTab === tab ? 500 : 400,
  });

  return (
    <Tile
      title="Master Notes"
      titleAction={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Edit / Preview toggle */}
          <div
            role="group"
            aria-label="Editor view"
            style={{ display: 'flex', gap: 2 }}
            data-no-drag
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'edit'}
              onClick={() => setActiveTab('edit')}
              style={tabBtnStyle('edit')}
            >
              Edit
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'preview'}
              onClick={() => setActiveTab('preview')}
              style={tabBtnStyle('preview')}
            >
              Preview
            </button>
          </div>
          <span
            aria-live="polite"
            style={{
              fontSize: 11,
              color: statusColor[status],
              fontFamily: 'var(--body)',
              letterSpacing: '0.04em',
            }}
          >
            {statusCopy[status]}
          </span>
          <button
            type="button"
            onClick={() =>
              process.mutate(
                { orgId, projectId },
                {
                  onError: (err) => {
                    // Surface inline; alert log captures the detail server-side.
                    console.warn('[master-notes] process failed', err);
                  },
                },
              )
            }
            disabled={process.isPending}
            data-no-drag
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              border: '1px solid var(--rule)',
              borderRadius: 4,
              background: 'transparent',
              padding: '3px 8px',
              cursor: process.isPending ? 'wait' : 'pointer',
              fontSize: 11,
              color: 'var(--ink-2)',
              fontFamily: 'var(--body)',
            }}
          >
            <Sparkles size={11} strokeWidth={1.5} aria-hidden="true" />
            {process.isPending ? 'Processing…' : 'Process now'}
          </button>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: 1,
          minHeight: 0,
        }}
      >
        {activeTab === 'edit' ? (
          <textarea
            aria-label="Master notes for this account/project"
            placeholder={
              editor.loaded
                ? 'Free-form notes. Autosaves while you type. Click "Process now" to extract tasks, OEM mentions, and customer asks into the approvals queue.'
                : 'Loading…'
            }
            value={editor.value}
            onChange={(e) => editor.setValue(e.target.value)}
            spellCheck={false}
            style={textareaStyle}
            data-no-drag
          />
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 220,
              maxHeight: 400,
              overflowY: 'auto',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              padding: '12px 14px',
              background: 'var(--bg)',
            }}
            data-no-drag
          >
            <MarkdownViewer
              source={editor.value}
              ariaLabel="Master notes preview"
            />
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 11,
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {editor.filePath ? `Mirrored to ${editor.filePath}` : 'Vault not set — DB only'}
          </span>
          {lastIngestedLabel && <span>Last processed {lastIngestedLabel}</span>}
        </div>
      </div>
    </Tile>
  );
}
