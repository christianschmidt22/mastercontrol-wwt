import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { Check, MessageSquare, RefreshCw, X } from 'lucide-react';
import { Tile } from '../tiles/Tile';
import {
  useNoteProposals,
  useReviseNoteProposal,
  useUpdateNoteProposalStatus,
} from '../../api/useNotes';
import type { NoteProposal } from '../../types';

const buttonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  border: '1px solid var(--rule)',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--ink-2)',
  fontFamily: 'var(--body)',
  fontSize: 11,
  padding: '3px 8px',
  cursor: 'pointer',
} satisfies CSSProperties;

function formatType(type: NoteProposal['type']): string {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function describeOutcome(proposal: NoteProposal): React.ReactNode {
  const p = proposal.proposed_payload;

  switch (proposal.type) {
    case 'task_follow_up': {
      const due = typeof p['due_date'] === 'string' && p['due_date']
        ? ` — due ${p['due_date']}`
        : ' — due 1 week from now (no date in note)';
      return <>Creates a <strong>task</strong>: "{proposal.title}"{due}</>;
    }
    case 'customer_ask': {
      const urgency = typeof p['urgency'] === 'string' ? ` (${p['urgency']} urgency)` : '';
      const by = typeof p['requested_by'] === 'string' ? ` — from ${p['requested_by']}` : '';
      return (
        <>
          Records a <strong>customer ask</strong>: "{proposal.title}"{urgency}{by}.
          <br />
          <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            Saved as queryable internal memory for the agents — does not appear on dashboards or in Recent Notes.
          </span>
        </>
      );
    }
    case 'oem_mention': {
      const oem = typeof p['oem_name'] === 'string' ? p['oem_name'] : 'an OEM partner';
      const sentiment = typeof p['sentiment'] === 'string' ? ` — ${p['sentiment']}` : '';
      return <>Logs a mention on <strong>{oem}</strong>{sentiment}.</>;
    }
    case 'internal_resource': {
      const name = typeof p['name'] === 'string' ? p['name'] : 'Unknown';
      const role = typeof p['role'] === 'string' ? p['role'] : null;
      const team = typeof p['team'] === 'string' ? p['team'] : null;
      const detail = [role, team].filter(Boolean).join(', ');
      return <>Adds <strong>{name}{detail ? ` (${detail})` : ''}</strong> to <strong>WWT Resources</strong> on this project.</>;
    }
    default:
      return null;
  }
}

function NoteApprovalModal({
  proposal,
  onClose,
}: {
  proposal: NoteProposal;
  onClose: () => void;
}) {
  const updateStatus = useUpdateNoteProposalStatus();
  const reviseProposal = useReviseNoteProposal();
  const [discussion, setDiscussion] = useState('');
  const [reviseError, setReviseError] = useState<string | null>(null);

  const finish = (status: 'approved' | 'denied' | 'discussing') => {
    updateStatus.mutate(
      {
        id: proposal.id,
        status,
        discussion: status === 'discussing' ? discussion.trim() || null : null,
      },
      { onSuccess: onClose },
    );
  };

  const redo = () => {
    const feedback = discussion.trim();
    if (feedback.length < 3) {
      setReviseError('Add a sentence or two of feedback before retrying.');
      return;
    }
    setReviseError(null);
    reviseProposal.mutate(
      { id: proposal.id, orgId: proposal.organization_id, feedback },
      {
        onSuccess: (revised) => {
          // Server returns null when the model decides nothing should be
          // proposed — close the modal in that case. Otherwise stay open
          // with the freshly-revised proposal pre-loaded.
          if (revised === null) {
            onClose();
          } else {
            setDiscussion('');
          }
        },
        onError: (err) => {
          setReviseError(err instanceof Error ? err.message : 'Redo failed');
        },
      },
    );
  };

  const isBusy = updateStatus.isPending || reviseProposal.isPending;

  const outcome = describeOutcome(proposal);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-approval-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(6, 9, 13, 0.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: 'min(680px, 100%)',
          maxHeight: '86vh',
          overflow: 'auto',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          background: 'var(--bg)',
          padding: 22,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.32)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start' }}>
          <div>
            <p
              style={{
                margin: '0 0 6px',
                color: 'var(--ink-3)',
                fontFamily: 'var(--body)',
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {formatType(proposal.type)}
            </p>
            <h2
              id="note-approval-title"
              style={{
                margin: 0,
                color: 'var(--ink-1)',
                fontFamily: 'var(--display)',
                fontSize: 26,
                lineHeight: 1.2,
                fontWeight: 500,
              }}
            >
              {proposal.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...buttonStyle, flexShrink: 0 }}>
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        {/* What approve will do — plain language */}
        {outcome && (
          <div
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 6,
              padding: '10px 14px',
              background: 'var(--bg-2)',
              fontSize: 13,
              color: 'var(--ink-1)',
              lineHeight: 1.55,
              fontFamily: 'var(--body)',
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginBottom: 4,
                fontWeight: 600,
              }}
            >
              Approving will
            </span>
            {outcome}
          </div>
        )}

        {/* Evidence from the note */}
        <blockquote
          style={{
            margin: 0,
            borderLeft: '2px solid var(--accent)',
            paddingLeft: 12,
            color: 'var(--ink-2)',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              marginBottom: 4,
              fontWeight: 600,
            }}
          >
            From the note
          </span>
          {proposal.evidence_quote}
        </blockquote>

        {/* Discussion textarea */}
        <div>
          <label
            htmlFor="approval-discussion"
            style={{
              display: 'block',
              marginBottom: 6,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Notes (optional)
          </label>
          <textarea
            id="approval-discussion"
            rows={3}
            value={discussion}
            onChange={(event) => setDiscussion(event.target.value)}
            placeholder="Tell the agent what was wrong, then click Redo. e.g. &quot;this should be a task, not an insight — the customer literally asked for X by Friday&quot;"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--ink-1)',
              padding: 10,
              fontFamily: 'var(--body)',
              fontSize: 13,
              resize: 'vertical',
            }}
          />
          {reviseError && (
            <p
              role="alert"
              style={{
                margin: '6px 0 0',
                color: 'var(--accent)',
                fontSize: 12,
                fontFamily: 'var(--body)',
              }}
            >
              {reviseError}
            </p>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={redo}
            disabled={isBusy}
            title="Apply the feedback above and regenerate this proposal"
            style={{
              ...buttonStyle,
              opacity: isBusy ? 0.6 : 1,
              cursor: isBusy ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={12} aria-hidden="true" />
            {reviseProposal.isPending ? 'Thinking…' : 'Redo with feedback'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => finish('denied')} style={buttonStyle} disabled={isBusy}>
              <X size={12} aria-hidden="true" />
              Deny
            </button>
            <button type="button" onClick={() => finish('discussing')} style={buttonStyle} disabled={isBusy}>
              <MessageSquare size={12} aria-hidden="true" />
              Save note
            </button>
            <button
              type="button"
              onClick={() => finish('approved')}
              disabled={isBusy}
              style={{ ...buttonStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              <Check size={12} aria-hidden="true" />
              Approve
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function NoteApprovalsTile() {
  const proposalsQuery = useNoteProposals('pending', 20);
  const [selected, setSelected] = useState<NoteProposal | null>(null);
  const proposals = proposalsQuery.data ?? [];

  return (
    <Tile title="Note Approvals" count={proposalsQuery.isLoading ? '...' : proposals.length || undefined}>
      {proposalsQuery.isError && (
        <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>Couldn't load approvals.</p>
      )}
      {proposalsQuery.isLoading && (
        <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading...</p>
      )}
      {!proposalsQuery.isLoading && !proposalsQuery.isError && proposals.length === 0 && (
        <div
          role="status"
          style={{
            border: '1px dashed var(--rule)',
            borderRadius: 6,
            padding: 16,
            textAlign: 'center',
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            fontSize: 13,
          }}
        >
          No note extractions pending approval.
        </div>
      )}
      {proposals.length > 0 && (
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {proposals.map((proposal) => (
            <li key={proposal.id} style={{ borderBottom: '1px dotted var(--rule)' }}>
              <button
                type="button"
                onClick={() => setSelected(proposal)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: '8px 0',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    color: 'var(--ink-1)',
                    fontFamily: 'var(--body)',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {proposal.title}
                </span>
                <span
                  style={{
                    display: 'block',
                    marginTop: 3,
                    color: 'var(--ink-3)',
                    fontFamily: 'var(--body)',
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatType(proposal.type)} - {proposal.summary}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && <NoteApprovalModal proposal={selected} onClose={() => setSelected(null)} />}
    </Tile>
  );
}
