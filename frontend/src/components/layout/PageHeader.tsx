import type { CSSProperties, ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  titleSingleLine?: boolean;
}

const eyebrowStyle: CSSProperties = {
  fontFamily: 'var(--body)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  margin: '0 0 8px',
};

const titleBaseStyle: CSSProperties = {
  fontFamily: 'var(--display)',
  fontSize: 'clamp(18px, 2.8vw, 42px)',
  fontWeight: 500,
  lineHeight: 1.02,
  letterSpacing: '-0.02em',
  color: 'var(--ink-1)',
  margin: '0 0 8px -3px',
};

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  titleSingleLine = false,
}: PageHeaderProps) {
  return (
    <header style={{ marginTop: -10, marginBottom: 32 }}>
      <p style={eyebrowStyle}>{eyebrow}</p>
      <div
        style={{
          display: actions ? 'flex' : 'block',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h1
            title={titleSingleLine ? title : undefined}
            style={{
              ...titleBaseStyle,
              ...(titleSingleLine
                ? {
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }
                : { textWrap: 'balance' }),
            }}
          >
            {title}
          </h1>
          {subtitle !== undefined && (
            <p
              style={{
                fontFamily: 'var(--body)',
                fontSize: 16,
                color: 'var(--ink-2)',
                margin: 0,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div style={{ flexShrink: 0, paddingTop: 4 }}>{actions}</div>}
      </div>
    </header>
  );
}
