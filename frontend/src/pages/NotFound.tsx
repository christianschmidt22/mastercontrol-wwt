import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';

export function NotFound() {
  return (
    <div>
      <PageHeader
        eyebrow="404"
        title="Page not found"
        subtitle="That page doesn't exist in this notebook."
      />
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
