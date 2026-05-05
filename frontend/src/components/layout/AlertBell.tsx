import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import {
  useAlertCount,
  useAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
} from '../../api/useCalendar';
import { formatAlertTimestamp } from '../../utils/alertTime';
import type { SystemAlert } from '../../types';

function severityIcon(severity: SystemAlert['severity']) {
  if (severity === 'error') return <AlertTriangle size={13} color="var(--accent)" aria-hidden="true" />;
  if (severity === 'warn') return <AlertTriangle size={13} color="#c2710c" aria-hidden="true" />;
  return <Info size={13} color="var(--ink-3)" aria-hidden="true" />;
}

function AlertRow({ alert, onRead }: { alert: SystemAlert; onRead: (id: number) => void }) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '16px 1fr auto',
        gap: 8,
        alignItems: 'start',
        padding: '10px 0',
        borderBottom: '1px solid var(--rule)',
        opacity: alert.read_at ? 0.5 : 1,
      }}
    >
      <span style={{ paddingTop: 1 }}>{severityIcon(alert.severity)}</span>
      <div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.4 }}>
          {alert.message}
        </p>
        {alert.detail && (
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono, monospace)', wordBreak: 'break-word' }}>
            {alert.detail}
          </p>
        )}
        <p style={{ margin: '3px 0 0', fontSize: 10, color: 'var(--ink-3)' }}>
          {alert.source} · {formatAlertTimestamp(alert.created_at)}
        </p>
      </div>
      {!alert.read_at && (
        <button
          type="button"
          onClick={() => onRead(alert.id)}
          aria-label="Dismiss alert"
          style={{
            background: 'none', border: 'none', padding: 2,
            cursor: 'pointer', color: 'var(--ink-3)',
            display: 'flex', alignItems: 'center',
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

export function AlertBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { data: countData } = useAlertCount();
  const { data: alertsData } = useAlerts(true);
  const { mutate: markRead } = useMarkAlertRead();
  const { mutate: markAllRead } = useMarkAllAlertsRead();

  const unreadCount = countData?.unread_count ?? 0;
  const alerts = alertsData?.alerts ?? [];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={unreadCount > 0 ? `${unreadCount} unread system alert${unreadCount === 1 ? '' : 's'}` : 'System alerts'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative',
          background: 'none', border: 'none',
          cursor: 'pointer', padding: 6,
          color: unreadCount > 0 ? 'var(--accent)' : 'var(--ink-3)',
          display: 'flex', alignItems: 'center',
          borderRadius: 6,
          outline: 'none',
        }}
        onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'; }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      >
        <Bell size={18} strokeWidth={1.5} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 2, right: 2,
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent)',
              border: '1.5px solid var(--bg-1, white)',
            }}
          />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="System alerts"
          style={{
            position: 'fixed',
            top: 48, right: 16,
            width: 360,
            maxHeight: '70vh',
            overflowY: 'auto',
            background: 'var(--bg-1)',
            border: '1px solid var(--rule)',
            borderRadius: 8,
            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--rule)',
              position: 'sticky', top: 0, background: 'var(--bg-1)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>
              System Alerts
              {unreadCount > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 400 }}>
                  {unreadCount} unread
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Link
                to="/alerts"
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--body)',
                  padding: '2px 4px',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                View all
              </Link>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  style={{
                    fontSize: 11, color: 'var(--ink-3)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--body)', padding: '2px 4px',
                  }}
                >
                  Dismiss all
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close alerts"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 2 }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Alert list */}
          <div style={{ padding: '0 16px' }}>
            {alerts.length === 0 && (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <CheckCircle size={20} color="var(--ink-3)" aria-hidden="true" style={{ marginBottom: 6 }} />
                <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>No alerts</p>
              </div>
            )}
            <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {alerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onRead={(id) => markRead(id)}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
