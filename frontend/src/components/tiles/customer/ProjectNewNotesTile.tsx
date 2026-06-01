import { useState, type CSSProperties, type FormEvent } from 'react';
import { Check, FilePenLine, Loader2 } from 'lucide-react';
import { Tile } from '../Tile';
import { useCaptureProjectDiscussionNote } from '../../../api/useMasterNotes';

interface ProjectNewNotesTileProps {
  orgId: number;
  projectId: number;
}

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 180,
  border: '1px solid var(--rule)',
  borderRadius: 6,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 14,
  lineHeight: 1.55,
  padding: '12px 14px',
  boxSizing: 'border-box',
  outline: 'none',
  resize: 'vertical',
};

const statusStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
};

export function ProjectNewNotesTile({ orgId, projectId }: ProjectNewNotesTileProps) {
  const capture = useCaptureProjectDiscussionNote();
  const [content, setContent] = useState('');
  const [lastResult, setLastResult] = useState<{
    updated: boolean;
    summary: string | null;
    warning: string | null;
  } | null>(null);

  const canSubmit = content.trim().length > 0 && !capture.isPending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setLastResult(null);
    capture.mutate(
      { orgId, projectId, content: trimmed },
      {
        onSuccess: (result) => {
          setContent('');
          setLastResult({
            updated: result.project_note_updated,
            summary: result.merge_summary,
            warning: result.warning,
          });
        },
      },
    );
  }

  return (
    <Tile title="New Notes">
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}
      >
        <label
          htmlFor={`project-new-note-${projectId}`}
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          Discussion note
        </label>
        <textarea
          id={`project-new-note-${projectId}`}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Capture what happened, decisions, open questions, and any next steps you want extracted."
          style={textareaStyle}
          data-no-drag
        />

        {capture.isPending && (
          <p role="status" style={{ ...statusStyle, color: 'var(--ink-2)' }}>
            Saving the discussion note, updating Project Notes, and checking for task/resource proposals.
          </p>
        )}

        {capture.isError && (
          <p role="alert" style={{ margin: 0, color: 'var(--accent)', fontSize: 13 }}>
            {capture.error.message}
          </p>
        )}
        {lastResult && (
          <p
            role="status"
            style={{
              ...statusStyle,
              color: lastResult.updated ? 'var(--ink-2)' : 'var(--accent)',
            }}
          >
            {lastResult.updated
              ? `${lastResult.summary ?? 'Project Notes updated.'} See the Project Notes tile on the left and the mirrored markdown file. Any extracted tasks, resources, or customer asks are in Agents > Insights for approval.`
              : `Saved the note, but Project Notes were not updated: ${lastResult.warning ?? 'unknown error'}`}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid var(--accent)',
              borderRadius: 6,
              background: canSubmit ? 'var(--accent)' : 'transparent',
              color: canSubmit ? '#fff' : 'var(--ink-3)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--body)',
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 12px',
            }}
            data-no-drag
          >
            {capture.isPending ? (
              <Loader2 size={14} strokeWidth={1.8} aria-hidden="true" />
            ) : lastResult?.updated ? (
              <Check size={14} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <FilePenLine size={14} strokeWidth={1.8} aria-hidden="true" />
            )}
            {capture.isPending ? 'Processing…' : 'Save and process'}
          </button>
        </div>
      </form>
    </Tile>
  );
}
