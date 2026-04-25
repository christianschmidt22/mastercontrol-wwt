import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div>
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2"
        style={{ color: 'var(--ink-3)' }}
      >
        404
      </p>
      <h1
        style={{
          fontFamily: 'var(--display)',
          fontSize: 56,
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          marginLeft: -3,
          marginBottom: 16,
        }}
      >
        Page not found
      </h1>
      <p style={{ color: 'var(--ink-2)', marginBottom: 24 }}>
        That page doesn&rsquo;t exist in this notebook.
      </p>
      <Link
        to="/"
        style={{
          color: 'var(--accent)',
          textDecoration: 'none',
          fontSize: 14,
        }}
      >
        &larr; Back to home
      </Link>
    </div>
  );
}
