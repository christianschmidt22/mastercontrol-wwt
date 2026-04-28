import type { ReactNode } from 'react';
import { SkipLink } from './SkipLink';
import { Sidebar } from './Sidebar';
import { AlertBell } from './AlertBell';

interface ShellProps {
  children: ReactNode;
}

/**
 * Top-level layout: sidebar (220px fixed) + main content column.
 * Skip-link is the first focusable element per a11y requirements (R-011 § b).
 * <main id="main"> satisfies R-011 (id="main" for skip-link target).
 */
export function Shell({ children }: ShellProps) {
  return (
    <>
      {/* Skip-link must be the very first focusable element */}
      <SkipLink />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          minHeight: '100vh',
        }}
      >
        <Sidebar />

        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {/* Top-right alert bell — fixed so it floats above page content */}
          <div
            aria-label="Alert controls"
            style={{
              position: 'fixed',
              top: 12, right: 16,
              zIndex: 500,
            }}
          >
            <AlertBell />
          </div>

          <main
            id="main"
            tabIndex={-1}
            style={{
              padding: '28px 36px 80px',
              outline: 'none',
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
