import { useMemo, useState, type CSSProperties } from 'react';
import { AlertTriangle, CheckCircle2, Circle, RotateCcw } from 'lucide-react';
import {
  useAlerts,
  useMarkAlertRead,
  useResolveAlert,
  useUnresolveAlert,
  type AlertFilters,
} from '../api/useCalendar';
import { TileEmptyState } from '../components/tiles/TileEmptyState';
import { formatAlertTimestamp } from '../utils/alertTime';
import type { SystemAlert } from '../types';

type SortKey = 'severity' | 'source' | 'message' | 'created_at' | 'read_at' | 'resolved_at';
type SortDir = 'asc' | 'desc';

const cell: CSSProperties = {
  padding: '9px 10px',
  borderBottom: '1px solid var(--rule)',
  verticalAlign: 'top',
  fontSize: 13,
};

const headerButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: 0,
  fontFamily: 'var(--body)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const filterControl: CSSProperties = {
  width: '100%',
  border: '1px solid var(--rule)',
  borderRadius: 4,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 12,
  padding: '5px 7px',
};

function severityColor(severity: SystemAlert['severity']): string {
  if (severity === 'error') return 'var(--accent)';
  if (severity === 'warn') return '#b86b00';
  return 'var(--ink-3)';
}

function compareValue(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function sortAlerts(alerts: SystemAlert[], key: SortKey, dir: SortDir): SystemAlert[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...alerts].sort((a, b) => {
    let result = 0;
    if (key === 'severity') result = a.severity.localeCompare(b.severity);
    if (key === 'source') result = a.source.localeCompare(b.source);
    if (key === 'message') result = a.message.localeCompare(b.message);
    if (key === 'created_at') result = compareValue(a.created_at, b.created_at);
    if (key === 'read_at') result = compareValue(a.read_at, b.read_at);
    if (key === 'resolved_at') result = compareValue(a.resolved_at, b.resolved_at);
    return result === 0 ? b.id - a.id : result * factor;
  });
}

function HeaderButton({
  label,
  sortKey,
  sort,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sort === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={headerButton}
    >
      {label}
      {active ? (dir === 'asc' ? '↑' : '↓') : null}
    </button>
  );
}

export function AlertsPage() {
  const [status, setStatus] = useState<NonNullable<AlertFilters['status']>>('all');
  const [severity, setSeverity] = useState<SystemAlert['severity'] | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [messageFilter, setMessageFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('created_at');
  const [dir, setDir] = useState<SortDir>('desc');

  const alertsQuery = useAlerts({ status, severity, limit: 200 });
  const markRead = useMarkAlertRead();
  const resolveAlert = useResolveAlert();
  const unresolveAlert = useUnresolveAlert();

  const alerts = useMemo(() => alertsQuery.data?.alerts ?? [], [alertsQuery.data?.alerts]);
  const sources = useMemo(
    () => Array.from(new Set(alerts.map((alert) => alert.source))).sort(),
    [alerts],
  );

  const visibleAlerts = useMemo(() => {
    const needle = messageFilter.trim().toLowerCase();
    const filtered = alerts.filter((alert) => {
      if (sourceFilter !== 'all' && alert.source !== sourceFilter) return false;
      if (needle && !`${alert.message} ${alert.detail ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    return sortAlerts(filtered, sort, dir);
  }, [alerts, dir, messageFilter, sort, sourceFilter]);

  const activeCount = alertsQuery.data?.active_count ?? alertsQuery.data?.unread_count ?? 0;
  const handleSort = (key: SortKey) => {
    if (sort === key) setDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir('asc');
    }
  };

  return (
    <div style={{ marginTop: -10 }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginBottom: 8,
        }}
      >
        ALERTS
      </p>
      <h1
        style={{
          fontFamily: 'var(--display)',
          fontSize: 'clamp(18px, 2.8vw, 42px)',
          fontWeight: 500,
          lineHeight: 1.02,
          margin: 0,
        }}
      >
        Alerts
      </h1>
      <p style={{ margin: '8px 0 32px', color: 'var(--ink-2)', fontSize: 16 }}>
        {activeCount} unread unresolved
      </p>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: 16,
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse', fontFamily: 'var(--body)' }}>
          <thead>
            <tr>
              <th style={{ ...cell, width: 42 }} />
              <th style={{ ...cell, textAlign: 'left', width: 115 }}>
                <HeaderButton label="Severity" sortKey="severity" sort={sort} dir={dir} onSort={handleSort} />
              </th>
              <th style={{ ...cell, textAlign: 'left', width: 150 }}>
                <HeaderButton label="Source" sortKey="source" sort={sort} dir={dir} onSort={handleSort} />
              </th>
              <th style={{ ...cell, textAlign: 'left', minWidth: 280 }}>
                <HeaderButton label="Message" sortKey="message" sort={sort} dir={dir} onSort={handleSort} />
              </th>
              <th style={{ ...cell, textAlign: 'left', width: 155 }}>
                <HeaderButton label="Created" sortKey="created_at" sort={sort} dir={dir} onSort={handleSort} />
              </th>
              <th style={{ ...cell, textAlign: 'left', width: 155 }}>
                <HeaderButton label="Read" sortKey="read_at" sort={sort} dir={dir} onSort={handleSort} />
              </th>
              <th style={{ ...cell, textAlign: 'left', width: 155 }}>
                <HeaderButton label="Resolved" sortKey="resolved_at" sort={sort} dir={dir} onSort={handleSort} />
              </th>
              <th style={{ ...cell, width: 150 }} />
            </tr>
            <tr>
              <th style={cell}>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('all');
                    setSeverity('all');
                    setSourceFilter('all');
                    setMessageFilter('');
                  }}
                  style={{ ...headerButton, color: 'var(--ink-3)' }}
                >
                  Reset
                </button>
              </th>
              <th style={cell}>
                <select
                  aria-label="Filter alerts by severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as SystemAlert['severity'] | 'all')}
                  style={filterControl}
                >
                  <option value="all">All</option>
                  <option value="error">Error</option>
                  <option value="warn">Warn</option>
                  <option value="info">Info</option>
                </select>
              </th>
              <th style={cell}>
                <select
                  aria-label="Filter alerts by source"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  style={filterControl}
                >
                  <option value="all">All sources</option>
                  {sources.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
              </th>
              <th style={cell}>
                <input
                  aria-label="Filter alerts by message"
                  value={messageFilter}
                  onChange={(e) => setMessageFilter(e.target.value)}
                  placeholder="Filter message or detail"
                  style={filterControl}
                />
              </th>
              <th style={cell}>
                <select
                  aria-label="Filter alerts by status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as NonNullable<AlertFilters['status']>)}
                  style={filterControl}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Unread unresolved</option>
                  <option value="unread">Unread</option>
                  <option value="unresolved">Unresolved</option>
                  <option value="resolved">Resolved</option>
                </select>
              </th>
              <th style={cell} />
              <th style={cell} />
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {alertsQuery.isLoading && (
              <tr><td colSpan={8} style={{ ...cell, color: 'var(--ink-3)' }}>Loading...</td></tr>
            )}
            {!alertsQuery.isLoading && visibleAlerts.length === 0 && (
              <tr>
                <td colSpan={8} style={cell}>
                  <TileEmptyState copy="No alerts match the current table filters." ariaLive />
                </td>
              </tr>
            )}
            {visibleAlerts.map((alert) => (
              <tr key={alert.id}>
                <td style={cell}>
                  {alert.resolved_at ? (
                    <CheckCircle2 size={15} color="var(--ink-3)" aria-label="Resolved" />
                  ) : (
                    <AlertTriangle size={15} color={severityColor(alert.severity)} aria-label="Unresolved" />
                  )}
                </td>
                <td style={{ ...cell, color: severityColor(alert.severity), fontWeight: 700 }}>{alert.severity}</td>
                <td style={{ ...cell, color: 'var(--ink-2)' }}>{alert.source}</td>
                <td style={{ ...cell, color: 'var(--ink-1)' }}>
                  <div>{alert.message}</div>
                  {alert.detail && (
                    <div style={{ marginTop: 3, color: 'var(--ink-3)', fontFamily: 'var(--mono, monospace)', fontSize: 11 }}>
                      {alert.detail}
                    </div>
                  )}
                </td>
                <td style={{ ...cell, color: 'var(--ink-3)' }}>{formatAlertTimestamp(alert.created_at)}</td>
                <td style={{ ...cell, color: 'var(--ink-3)' }}>{formatAlertTimestamp(alert.read_at)}</td>
                <td style={{ ...cell, color: 'var(--ink-3)' }}>{formatAlertTimestamp(alert.resolved_at)}</td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                  {!alert.read_at && (
                    <button
                      type="button"
                      onClick={() => markRead.mutate(alert.id)}
                      style={{ ...headerButton, marginRight: 10, color: 'var(--ink-2)' }}
                    >
                      <Circle size={11} aria-hidden="true" />
                      Read
                    </button>
                  )}
                  {alert.resolved_at ? (
                    <button
                      type="button"
                      onClick={() => unresolveAlert.mutate(alert.id)}
                      style={{ ...headerButton, color: 'var(--ink-2)' }}
                    >
                      <RotateCcw size={11} aria-hidden="true" />
                      Reopen
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => resolveAlert.mutate(alert.id)}
                      style={{ ...headerButton, color: 'var(--ink-2)' }}
                    >
                      <CheckCircle2 size={12} aria-hidden="true" />
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
