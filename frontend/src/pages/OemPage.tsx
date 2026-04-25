import { useParams } from 'react-router-dom';

export function OemPage() {
  const { id } = useParams<{ id?: string }>();

  return (
    <div>
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2"
        style={{ color: 'var(--ink-3)' }}
      >
        OEM
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
        {id ? `OEM Partner #${id}` : 'OEM Partners'}
      </h1>
      <p style={{ color: 'var(--ink-2)' }}>OEM detail tiles coming in Phase 1.</p>
    </div>
  );
}
