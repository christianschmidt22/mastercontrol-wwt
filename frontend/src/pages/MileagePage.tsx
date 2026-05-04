import { useMemo, useState, type CSSProperties } from 'react';
import { Calculator, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useMileageReport } from '../api';
import type { MileageReportRow } from '../types';

const fieldStyle: CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 5,
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--body)',
  fontSize: 13,
  padding: '8px 10px',
  boxSizing: 'border-box',
};

function buttonStyle(disabled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    border: '1px solid var(--rule)',
    borderRadius: 5,
    background: 'var(--bg)',
    color: disabled ? 'var(--ink-3)' : 'var(--ink-2)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--body)',
    fontSize: 12,
    padding: '8px 11px',
  };
}

const panelStyle: CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 6,
  background: 'var(--surface)',
  minWidth: 0,
};

function localDateString(date: Date): string {
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`
  );
}

function defaultStartDate(): string {
  const now = new Date();
  return localDateString(new Date(now.getFullYear(), now.getMonth(), 1));
}

function formatMiles(value: number | null): string {
  return value == null ? 'Needs calculation' : value.toFixed(1);
}

function sourceLabel(row: MileageReportRow): string {
  if (row.distance_source === 'cache') return 'Cached';
  if (row.distance_source === 'osrm') return 'Calculated';
  if (row.distance_source === 'unavailable') return 'Unavailable';
  return 'Not calculated';
}

export function MileagePage() {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(() => localDateString(new Date()));
  const [calculate, setCalculate] = useState(false);
  const [submitted, setSubmitted] = useState({
    startDate: defaultStartDate(),
    endDate: localDateString(new Date()),
    calculate: false,
  });

  const dateRangeValid = endDate >= startDate;
  const reportQuery = useMileageReport(
    submitted.startDate,
    submitted.endDate,
    submitted.calculate,
    Boolean(submitted.startDate && submitted.endDate),
  );
  const rows = useMemo(() => reportQuery.data?.rows ?? [], [reportQuery.data?.rows]);
  const isBusy = reportQuery.isFetching;

  function runReport(nextCalculate = calculate) {
    if (!dateRangeValid) return;
    setSubmitted({ startDate, endDate, calculate: nextCalculate });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Mileage"
        title="Mileage"
        subtitle="Build an expense-report mileage table from synced calendar events with physical locations."
      />

      <section style={panelStyle}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--rule)', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                style={fieldStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                style={fieldStyle}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--ink-2)', fontSize: 12, paddingBottom: 8 }}>
              <input
                type="checkbox"
                checked={calculate}
                onChange={(event) => setCalculate(event.target.checked)}
              />
              Calculate missing miles
            </label>
            <button
              type="button"
              onClick={() => runReport()}
              disabled={!dateRangeValid || isBusy}
              style={buttonStyle(!dateRangeValid || isBusy)}
            >
              {isBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} strokeWidth={1.5} />}
              Run report
            </button>
            <button
              type="button"
              onClick={() => {
                setCalculate(true);
                runReport(true);
              }}
              disabled={!dateRangeValid || isBusy}
              style={buttonStyle(!dateRangeValid || isBusy)}
            >
              <Calculator size={14} strokeWidth={1.5} />
              Calculate all
            </button>
          </div>

          <div style={{ color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.5 }}>
            From address is fixed at 250 Pine St, Lino Lakes, MN 55014. Teams/virtual meetings and 1601 Utica Ave office
            events are filtered out. Missing miles are calculated through OpenStreetMap/OSRM and cached locally.
          </div>
          {!dateRangeValid && (
            <div style={{ color: 'var(--danger)', fontSize: 12 }}>End date must be on or after start date.</div>
          )}
        </div>

        <div style={{ padding: 16, display: 'flex', gap: 18, flexWrap: 'wrap', borderBottom: '1px solid var(--rule)' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total miles</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, color: 'var(--ink-1)' }}>
              {(reportQuery.data?.total_miles ?? 0).toFixed(1)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trips</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, color: 'var(--ink-1)' }}>{rows.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Filtered out</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, color: 'var(--ink-1)' }}>
              {reportQuery.data?.excluded_count ?? 0}
            </div>
          </div>
        </div>

        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ width: 110, padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'left' }}>Date</th>
                <th style={{ minWidth: 220, padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'left' }}>Subject</th>
                <th style={{ minWidth: 240, padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'left' }}>From address</th>
                <th style={{ minWidth: 260, padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'left' }}>To address</th>
                <th style={{ width: 110, padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'left' }}>Type</th>
                <th style={{ width: 110, padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'right' }}>Miles</th>
              </tr>
            </thead>
            <tbody>
              {reportQuery.isLoading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 18, color: 'var(--ink-3)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Loader2 size={15} className="animate-spin" />
                      Loading mileage report
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 18, color: 'var(--ink-3)', fontSize: 13 }}>
                    No mileage-eligible calendar events found in this date range.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.uid}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>{row.date}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-1)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.subject}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>{row.from_address}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                      <span>{row.to_address}</span>{' '}
                      <a href={row.maps_url} target="_blank" rel="noreferrer" aria-label={`Open route for ${row.subject} in Google Maps`} style={{ color: 'var(--ink-3)' }}>
                        <ExternalLink size={13} strokeWidth={1.5} />
                      </a>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>{row.type}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'right', color: row.miles == null ? 'var(--ink-3)' : 'var(--ink-1)' }} title={row.distance_error ?? sourceLabel(row)}>
                      {formatMiles(row.miles)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
