/**
 * OutlookPage — Outlook integration status and sync controls.
 *
 * Route: /outlook
 *
 * MasterControl reads your local Outlook cache directly via Windows COM
 * automation — no sign-in, no Azure app registration required.
 *
 * Sections:
 *   1. Status card: "Outlook is accessible" (green) or "Outlook is not
 *      running" (amber).
 *   2. Last sync time + "Sync Now" button.
 */

import { useOutlookStatus, useOutlookSyncNow } from '../api/useOutlook';
import { useQueryClient } from '@tanstack/react-query';
import { outlookKeys } from '../api/useOutlook';
import { PageHeader } from '../components/layout/PageHeader';

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function OutlookPage() {
  const { data: status, isLoading } = useOutlookStatus();
  const { mutate: syncNow, isPending: isSyncing } = useOutlookSyncNow();
  const qc = useQueryClient();

  function handleSyncNow() {
    syncNow(undefined, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: outlookKeys.status() });
      },
    });
  }

  return (
    <main
      style={{
        maxWidth: 600,
        marginTop: -10,
      }}
    >
      <PageHeader eyebrow="Outlook" title="Outlook" />

      {isLoading && (
        <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && status && (
        <>
          {/* Status card */}
          <section
            aria-label="Outlook status"
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 8,
              background: 'var(--surface)',
              padding: '20px 24px',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: status.connected ? '#2dab4f' : '#d97706',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-1)' }}>
                {status.connected ? 'Outlook is accessible' : 'Outlook is not running'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
              {status.connected
                ? 'MasterControl is reading your local Outlook cache directly — no sign-in required.'
                : 'Open Outlook and let it sync, then try again. No sign-in or Azure setup required.'}
            </p>
          </section>

          {/* Sync controls */}
          <section
            aria-label="Sync settings"
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 8,
              background: 'var(--surface)',
              padding: '20px 24px',
            }}
          >
            <h2
              style={{
                margin: '0 0 12px',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink-1)',
                fontFamily: 'var(--body)',
              }}
            >
              Sync
            </h2>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
                  Last synced:{' '}
                  <span style={{ color: 'var(--ink-1)' }}>
                    {formatDateTime(status.last_sync)}
                  </span>
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-3)' }}>
                  Automatic sync runs every 15 minutes while Outlook is open.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSyncNow}
                disabled={isSyncing}
                aria-disabled={isSyncing}
                style={{
                  padding: '7px 16px',
                  fontSize: 13,
                  border: '1px solid var(--rule)',
                  borderRadius: 5,
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                  opacity: isSyncing ? 0.5 : 1,
                  fontFamily: 'var(--body)',
                  whiteSpace: 'nowrap',
                }}
              >
                {isSyncing ? 'Syncing…' : 'Sync Now'}
              </button>
            </div>
          </section>

          <p
            style={{
              marginTop: 16,
              fontSize: 12,
              color: 'var(--ink-3)',
              lineHeight: 1.5,
            }}
          >
            MasterControl reads your local Outlook cache directly — no sign-in required.
            Outlook must be installed, open, and have synced recently.
          </p>
        </>
      )}
    </main>
  );
}
