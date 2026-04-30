/**
 * MarkdownViewer — read-only sanitized markdown renderer.
 *
 * Uses `marked` for CommonMark parsing and `DOMPurify` for sanitization.
 * All `<a>` tags are forced to open in a new tab with `rel="noopener noreferrer"`.
 *
 * Security: raw HTML from the source is never emitted without sanitization.
 * The DOMPurify allowlist forbids `script`, `style`, `iframe`, `form`,
 * `input`, and `button` tags (R-026 ethos).
 *
 * a11y: the wrapper carries `role="region"` and an `aria-label` so screen
 * readers can navigate to the content region. No transitions — respects
 * `prefers-reduced-motion` by design (no CSS transitions on this element).
 */

import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface MarkdownViewerProps {
  /** Raw markdown string to render. */
  source: string;
  /** Optional label for the accessible region (defaults to "Content"). */
  ariaLabel?: string;
  /** Optional additional class names for the wrapper div. */
  className?: string;
}

/** Sanitize options: conservative allowlist. */
const PURIFY_CONFIG = {
  ADD_ATTR: ['target', 'rel'] as string[],
  FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button'] as string[],
  FORCE_BODY: true,
};

/**
 * Post-process sanitized HTML: add target/_blank + rel to all anchor tags.
 * We do this via regex on the serialized string rather than DOM manipulation
 * so there is no SSR concern and no extra dependency.
 */
function addLinkTargets(html: string): string {
  // Replace <a ...> tags — add target and rel if not already present.
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    let updated = attrs;
    if (!/target=/i.test(attrs)) updated += ' target="_blank"';
    if (!/rel=/i.test(attrs)) updated += ' rel="noopener noreferrer"';
    return `<a${updated}>`;
  });
}

export function MarkdownViewer({ source, ariaLabel = 'Content', className }: MarkdownViewerProps) {
  const html = useMemo(() => {
    if (!source || source.trim() === '') return null;

    let rawHtml: string;
    try {
      const result = marked.parse(source, { async: false });
      // marked.parse with async:false always returns string
      rawHtml = result as string;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `<p style="color:var(--accent);font-family:var(--body);font-size:13px">Parse error: ${msg}</p>`;
    }

    const sanitized = DOMPurify.sanitize(rawHtml, PURIFY_CONFIG) as string;
    return addLinkTargets(sanitized);
  }, [source]);

  const wrapperStyle: React.CSSProperties = {
    fontFamily: 'var(--body)',
    fontSize: 13,
    color: 'var(--ink-2)',
    lineHeight: 1.65,
  };

  if (html === null) {
    return (
      <div
        role="region"
        aria-label={ariaLabel}
        className={className}
        style={{
          ...wrapperStyle,
          color: 'var(--ink-3)',
          fontStyle: 'italic',
        }}
      >
        No content
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={['mc-prose', className].filter(Boolean).join(' ')}
      style={wrapperStyle}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
