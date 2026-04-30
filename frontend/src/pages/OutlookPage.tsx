/**
 * OutlookPage — Outlook integration settings and status page.
 *
 * Route: /outlook (wired separately — this file is the page component only)
 *
 * Sections:
 *   1. Connection status card (email or "Not connected").
 *   2. "Connect Mailbox" button → OutlookSetup modal (device-code flow).
 *   3. Last sync time + "Sync Now" button.
 */

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useOutlookStatus, useOutlookSyncNow } from '../api/useOutlook';
import { OutlookSetup } from '../components/outlook/OutlookSetup';
import { useQueryClient } from '@tanstack/react-query';
import { outlookKeys } from '../api/useOutlook';

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
  const [showSetup, setShowSetup] = useState(false);
  const qc = useQueryClient();

  function handleAuthSuccess() {
    setShowSetup(false);
    void qc.invalidateQueries({ queryKey: outlookKeys.status() });
  }

  return (
    <main
      style={{
        maxWidth: 600,
        margin: '40px auto',
        padding: '0 24px',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
        <Mail size={20} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--ink-2)' }} />
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontFamily: 'var(--display)',
            fontWeight: 500,
            color: 'var(--ink-1)',
          }}
        >
          Outlook
        </h1>
      </header>

      {isLoading && (
        <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>Loading…</p>
      )}

      {!isLoading && status && (
        <>
          {/* Connection status card */}
          <section
            aria-label="Connection status"
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
                  background: status.connected ? '#2dab4f' : 'var(--ink-3)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-1)' }}>
                {status.connected ? 'Connected' : 'Not connected'}
              </span>
            </div>

            {status.connected && status.email && (
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-2)' }}>
                Signed in as{' '}
                <strong style={{ fontWeight: 600 }}>{status.email}</strong>
              </p>
            )}

            {!status.connected && (
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-3)' }}>
                Connect your Microsoft 365 mailbox to surface relevant emails
                alongside your org notes. Read-only access only.
              </p>
            )}

            {!status.connected && (
              <button
                type="button"
                onClick={() => setShowSetup(true)}
                style={{
                  padding: '7px 16px',
                  fontSize: 13,
                  border: 'none',
                  borderRadius: 5,
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'var(--body)',
                }}
              >
                Connect Mailbox
              </button>
            )}
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
                  Automatic sync runs every 15 minutes when connected.
                </p>
              </div>

              <button
                type="button"
                onClick={() => syncNow()}
                disabled={isSyncing || !status.connected}
                aria-disabled={isSyncing || !status.connected}
                style={{
                  padding: '7px 16px',
                  fontSize: 13,
                  border: '1px solid var(--rule)',
                  borderRadius: 5,
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  cursor: isSyncing || !status.connected ? 'not-allowed' : 'pointer',
                  opacity: isSyncing || !status.connected ? 0.5 : 1,
                  fontFamily: 'var(--body)',
                  whiteSpace: 'nowrap',
                }}
              >
                {isSyncing ? 'Syncing…' : 'Sync Now'}
              </button>
            </div>
          </section>

          {/* Prerequisites note if client ID not set */}
          <p
            style={{
              marginTop: 16,
              fontSize: 12,
              color: 'var(--ink-3)',
              lineHeight: 1.5,
            }}
          >
            To connect, you need an Azure app registration with{' '}
            <code style={{ fontFamily: 'monospace' }}>Mail.Read</code> delegated
            permission. Add the Client ID under Settings → Outlook Client ID.
          </p>
        </>
      )}

      {showSetup && (
        <OutlookSetup
          onSuccess={handleAuthSuccess}
          onClose={() => setShowSetup(false)}
        />
      )}
    </main>
  );
}
