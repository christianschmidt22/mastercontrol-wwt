import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Check, MessageSquare, X } from 'lucide-react';
import { Tile } from '../tiles/Tile';
import {
  useNoteProposals,
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

function NoteApprovalModal({
  proposal,
  onClose,
}: {
  proposal: NoteProposal;
  onClose: () => void;
}) {
  const updateStatus = useUpdateNoteProposalStatus();
  const [discussion, setDiscussion] = useState('');
  const details = JSON.stringify(proposal.proposed_payload, null, 2);

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
          width: 'min(760px, 100%)',
          maxHeight: '86vh',
          overflow: 'auto',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          background: 'var(--bg)',
          padding: 22,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.32)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18 }}>
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
                fontSize: 30,
                lineHeight: 1.15,
                fontWeight: 500,
              }}
            >
              {proposal.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={buttonStyle}>
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        <p style={{ color: 'var(--ink-1)', fontSize: 14, lineHeight: 1.55 }}>
          {proposal.summary}
        </p>
        <blockquote
          style={{
            margin: '14px 0',
            borderLeft: '2px solid var(--accent)',
            paddingLeft: 12,
            color: 'var(--ink-2)',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {proposal.evidence_quote}
        </blockquote>

        <pre
          style={{
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--rule)',
            borderRadius: 6,
            padding: 12,
            color: 'var(--ink-2)',
            background: 'var(--bg-2)',
            fontSize: 12,
            maxHeight: 180,
            overflow: 'auto',
          }}
        >
          {details}
        </pre>

        <label
          htmlFor="approval-discussion"
          style={{
            display: 'block',
            marginTop: 14,
            color: 'var(--ink-3)',
            fontFamily: 'var(--body)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Discussion notes
        </label>
        <textarea
          id="approval-discussion"
          rows={3}
          value={discussion}
          onChange={(event) => setDiscussion(event.target.value)}
          placeholder="What should the extractor do differently?"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            marginTop: 6,
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={() => finish('denied')} style={buttonStyle}>
            <X size={12} aria-hidden="true" />
            Deny
          </button>
          <button type="button" onClick={() => finish('discussing')} style={buttonStyle}>
            <MessageSquare size={12} aria-hidden="true" />
            Discuss
          </button>
          <button
            type="button"
            onClick={() => finish('approved')}
            style={{ ...buttonStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <Check size={12} aria-hidden="true" />
            Approve
          </button>
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
