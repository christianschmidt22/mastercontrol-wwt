export function TasksPage() {
  return (
    <div>
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2"
        style={{ color: 'var(--ink-3)' }}
      >
        Tasks
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
        Tasks
      </h1>
      <p style={{ color: 'var(--ink-2)' }}>Task list coming in Phase 1.</p>
    </div>
  );
}
