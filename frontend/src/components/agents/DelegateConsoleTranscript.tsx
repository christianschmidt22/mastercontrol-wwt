/**
 * DelegateConsoleTranscript.tsx
 *
 * Renders the transcript returned by POST /api/subagent/delegate-agentic.
 * Handles three entry kinds:
 *   assistant_text   — body paragraph in a card
 *   assistant_tool_use — collapsible monospace block
 *   tool_result      — truncated monospace block; red border on error
 */

import { useState } from 'react';
import type { TranscriptEntry } from '../../types/subagent';

// ---------------------------------------------------------------------------
// assistant_text
// ---------------------------------------------------------------------------

function TextEntry({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        border: '1px solid var(--rule)',
        borderRadius: 6,
        background: 'var(--bg)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 14,
          fontFamily: 'var(--body)',
          color: 'var(--ink-1)',
          lineHeight: 1.6,
          textWrap: 'pretty',
        }}
      >
        {text}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// assistant_tool_use
// ---------------------------------------------------------------------------

function ToolUseEntry({
  tool,
  input,
}: {
  tool: string;
  input: unknown;
}) {
  const [expanded, setExpanded] = useState(false);

  // Pull a short label from common input shapes
  const inputObj =
    input !== null && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : null;
  const pathHint =
    inputObj?.path ??
    inputObj?.file_path ??
    inputObj?.command ??
    null;
  const shortHint =
    typeof pathHint === 'string' && pathHint.length > 0
      ? ` — ${pathHint.length > 50 ? `…${pathHint.slice(-50)}` : pathHint}`
      : '';

  return (
    <div
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '10px 14px',
          background: 'var(--bg-2)',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden="true"
          style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}
        >
          {expanded ? '▾' : '▸'}
        </span>
        <span
          style={{
            fontSize: 13,
            fontFamily: 'var(--mono)',
            color: 'var(--ink-2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          → tool: {tool}
          {shortHint}
        </span>
      </button>

      {expanded && (
        <pre
          style={{
            margin: 0,
            padding: '12px 14px',
            fontSize: 12,
            fontFamily: 'var(--mono)',
            color: 'var(--ink-1)',
            background: 'var(--bg)',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// tool_result
// ---------------------------------------------------------------------------

const TRUNCATE_AT = 500;

function ToolResultEntry({
  output,
  is_error,
}: {
  output: string;
  is_error: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = !expanded && output.length > TRUNCATE_AT;
  const displayed = truncated ? output.slice(0, TRUNCATE_AT) : output;

  return (
    <div
      style={{
        border: `1px solid ${is_error ? 'var(--accent)' : 'var(--rule)'}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <pre
        style={{
          margin: 0,
          padding: '10px 14px',
          fontSize: 12,
          fontFamily: 'var(--mono)',
          color: is_error ? 'var(--accent)' : 'var(--ink-2)',
          background: 'var(--bg)',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {displayed}
        {truncated && '…'}
      </pre>
      {output.length > TRUNCATE_AT && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'block',
            width: '100%',
            padding: '6px 14px',
            background: 'var(--bg-2)',
            border: 'none',
            borderTop: '1px solid var(--rule)',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'var(--body)',
            color: 'var(--ink-3)',
            textAlign: 'left',
          }}
        >
          {expanded ? 'Show less' : `Show more (${output.length - TRUNCATE_AT} more chars)`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transcript list
// ---------------------------------------------------------------------------

interface DelegateConsoleTranscriptProps {
  entries: TranscriptEntry[];
}

export function DelegateConsoleTranscript({
  entries,
}: DelegateConsoleTranscriptProps) {
  if (entries.length === 0) return null;

  return (
    <div
      role="log"
      aria-label="Agent transcript"
      aria-live="polite"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {entries.map((entry, idx) => {
        if (entry.kind === 'assistant_text') {
          return <TextEntry key={idx} text={entry.text} />;
        }
        if (entry.kind === 'assistant_tool_use') {
          return (
            <ToolUseEntry
              key={entry.tool_use_id}
              tool={entry.tool}
              input={entry.input}
            />
          );
        }
        // tool_result
        return (
          <ToolResultEntry
            key={`${entry.tool_use_id}-result`}
            output={entry.output}
            is_error={entry.is_error}
          />
        );
      })}
    </div>
  );
}
