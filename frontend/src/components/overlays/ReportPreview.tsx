/**
 * ReportPreview — inline rendered-markdown preview for a report run output.
 *
 * Hand-rolled markdown renderer that handles the subset produced by the
 * Daily Task Review template:
 *   - # / ## / ### headings → h1/h2/h3 with display font
 *   - **bold** / *italic* inline spans
 *   - - / * bullet lists → <ul>
 *   - 1. / 2. numbered lists → <ol>
 *   - `code` inline → <code> with mono font
 *   - blank-line paragraph breaks
 *   - everything else (tables, fenced code blocks, images) → escaped <pre>
 *
 * SECURITY: raw HTML from the markdown source is never emitted. All text
 * nodes are HTML-escaped before insertion (R-026 ethos — treat AI-generated
 * file content as untrusted). React's JSX handles this automatically for
 * string children; the only place we touch raw HTML is the
 * `dangerouslySetInnerHTML` in InlineMarkdown, which operates exclusively
 * on output we build ourselves after escaping every source character.
 *
 * TODO(phase-3): replace with a full CommonMark renderer (e.g. react-markdown)
 * once the dependency has been vetted. Tables, fenced code blocks with
 * syntax highlighting, and blockquotes currently fall through to <pre>.
 */

import { Loader2, RefreshCw } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useReportRunOutput } from '../../api/useReportRuns';

// ---------------------------------------------------------------------------
// HTML escaping — defense against any raw HTML in the source
// ---------------------------------------------------------------------------

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Inline formatting (bold, italic, inline code)
// Applied only to safe (already-escaped) text segments.
// ---------------------------------------------------------------------------

/**
 * Convert inline markdown to HTML. Input MUST already be HTML-escaped.
 * We apply patterns to the escaped text so any `<`/`>` in the source are
 * already `&lt;`/`&gt;` — no injection risk.
 */
function inlineMarkdown(escaped: string): string {
  return escaped
    // Inline code — match before bold/italic so backtick content isn't parsed.
    .replace(/`([^`]+)`/g, '<code style="font-family:var(--mono);font-size:0.9em">$1</code>')
    // Bold (**text**)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic (*text*) — single asterisk, not preceded/followed by another
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
}

// ---------------------------------------------------------------------------
// Block-level parser
// ---------------------------------------------------------------------------

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; text: string }
  | { kind: 'pre'; text: string }; // fallback for unrecognised blocks

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip blank lines between blocks.
    if (trimmed === '') { i++; continue; }

    // Headings
    if (trimmed.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: trimmed.slice(4) });
      i++; continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: trimmed.slice(3) });
      i++; continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push({ kind: 'h1', text: trimmed.slice(2) });
      i++; continue;
    }

    // Unordered list
    if (/^[-*] /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test((lines[i] ?? '').trim())) {
        items.push((lines[i]!).trim().slice(2));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test((lines[i] ?? '').trim())) {
        items.push((lines[i]!).trim().replace(/^\d+\. /, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    // Fenced code block or other complex syntax → pre (escaped plain text)
    // TODO(phase-3): handle fenced code blocks with syntax highlighting.
    if (trimmed.startsWith('```') || trimmed.startsWith('|')) {
      const preLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim() !== '') {
        preLines.push(lines[i]!);
        i++;
      }
      blocks.push({ kind: 'pre', text: preLines.join('\n') });
      continue;
    }

    // Paragraph — collect until blank line.
    const paraLines: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() !== '') {
      paraLines.push(lines[i]!);
      i++;
    }
    blocks.push({ kind: 'p', text: paraLines.join(' ') });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Inline markdown renderer (safe — operates on escaped text)
// ---------------------------------------------------------------------------

function InlineMarkdown({ text }: { text: string }) {
  const html = inlineMarkdown(escapeHtml(text));
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------------------------------------------------------------------------
// Block renderer
// ---------------------------------------------------------------------------

const headingStyle = (level: number): CSSProperties => ({
  fontFamily: 'var(--display)',
  fontWeight: 500,
  color: 'var(--ink-1)',
  margin: level === 1 ? '0 0 10px' : '14px 0 6px',
  fontSize: level === 1 ? 20 : level === 2 ? 16 : 14,
  lineHeight: 1.3,
});

function RenderedBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case 'h1': return <h1 key={idx} style={headingStyle(1)}><InlineMarkdown text={block.text} /></h1>;
          case 'h2': return <h2 key={idx} style={headingStyle(2)}><InlineMarkdown text={block.text} /></h2>;
          case 'h3': return <h3 key={idx} style={headingStyle(3)}><InlineMarkdown text={block.text} /></h3>;
          case 'ul':
            return (
              <ul key={idx} style={{ margin: '6px 0', paddingLeft: 20, fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--body)' }}>
                {block.items.map((item, j) => <li key={j} style={{ marginBottom: 2 }}><InlineMarkdown text={item} /></li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={idx} style={{ margin: '6px 0', paddingLeft: 20, fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--body)' }}>
                {block.items.map((item, j) => <li key={j} style={{ marginBottom: 2 }}><InlineMarkdown text={item} /></li>)}
              </ol>
            );
          case 'pre':
            return (
              <pre key={idx} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', background: 'var(--bg)', border: '1px dashed var(--rule)', borderRadius: 4, padding: '8px 10px', overflowX: 'auto', margin: '6px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {block.text}
              </pre>
            );
          case 'p':
          default:
            return (
              <p key={idx} style={{ margin: '6px 0', fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--body)', lineHeight: 1.6 }}>
                <InlineMarkdown text={block.text} />
              </p>
            );
        }
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface ReportPreviewProps {
  reportId: number;
  runId: number;
  /** ISO-8601 string used for the accessible aria-label. */
  runDate: string;
  enabled: boolean;
}

export function ReportPreview({ reportId, runId, runDate, enabled }: ReportPreviewProps) {
  const query = useReportRunOutput(reportId, runId, enabled);

  const dateLabel = (() => {
    try { return new Date(runDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return runDate; }
  })();

  return (
    <section
      role="region"
      aria-label={`Report output for ${dateLabel}`}
      style={{
        marginTop: 10,
        padding: '12px 14px',
        background: 'var(--bg)',
        border: '1px solid var(--rule)',
        borderRadius: 6,
      }}
    >
      {query.isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)', fontSize: 13 }}>
          <Loader2 size={14} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />
          Loading preview…
        </div>
      )}

      {query.isError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
          <span>Couldn't load preview.</span>
          <button
            type="button"
            onClick={() => { void query.refetch(); }}
            aria-label="Retry loading report preview"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'none', border: '1px solid var(--rule)', borderRadius: 4,
              padding: '3px 8px', cursor: 'pointer', fontSize: 12,
              color: 'var(--ink-2)', fontFamily: 'var(--body)',
            }}
          >
            <RefreshCw size={12} strokeWidth={1.5} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {query.isSuccess && query.data && (
        <RenderedBlocks blocks={parseBlocks(query.data.content)} />
      )}
    </section>
  );
}
