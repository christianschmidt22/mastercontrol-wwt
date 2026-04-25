/**
 * Skip-to-main-content link (R-011 § b).
 * Visually hidden until focused; rendered as the first focusable element
 * inside Shell so keyboard users can bypass the sidebar immediately.
 */
export function SkipLink() {
  return (
    <a href="#main" className="skip-link">
      Skip to main content
    </a>
  );
}
