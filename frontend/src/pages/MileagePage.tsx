import { useMemo, useState, type CSSProperties } from 'react';
import { Calculator, Download, ExternalLink, FileImage, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useCalculateMileage, useExportMileagePdf, useMileageReport } from '../api';
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

interface ManualMileageRow {
  id: string;
  date: string;
  subject: string;
  from_address: string;
  to_address: string;
  type: 'round trip';
  miles: number | null;
  distance_error?: string | null;
}

type ExpenseMileageRow = Pick<
  MileageReportRow,
  'uid' | 'date' | 'subject' | 'from_address' | 'to_address' | 'type' | 'miles' | 'maps_url' | 'distance_error' | 'distance_source'
> & {
  isManual?: boolean;
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

function reportFileStem(startDate: string, endDate: string): string {
  return `mileage-report-${startDate}-to-${endDate}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportPng(rows: ExpenseMileageRow[], startDate: string, endDate: string, totalMiles: number): Promise<void> {
  const width = 1500;
  const rowHeight = 46;
  const headerHeight = 126;
  const footerHeight = 64;
  const height = headerHeight + rowHeight * Math.max(rows.length, 1) + footerHeight;
  const columns = [
    { label: 'Date', x: 30, width: 130 },
    { label: 'Subject', x: 160, width: 330 },
    { label: 'From Address', x: 490, width: 330 },
    { label: 'To Address', x: 820, width: 360 },
    { label: 'Type', x: 1180, width: 150 },
    { label: 'Miles', x: 1330, width: 140 },
  ];

  function clip(text: string, maxChars: number): string {
    return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}...` : text;
  }

  const headerCells = columns
    .map((column) => `<text x="${column.x}" y="102" font-size="16" font-weight="700" fill="#56635a">${escapeXml(column.label)}</text>`)
    .join('');
  const rowCells = rows
    .map((row, index) => {
      const y = headerHeight + index * rowHeight;
      return `
        <rect x="20" y="${y - 28}" width="${width - 40}" height="${rowHeight}" fill="${index % 2 === 0 ? '#ffffff' : '#f6f8f5'}" stroke="#d5ddd4" />
        <text x="${columns[0]!.x}" y="${y}" font-size="16" fill="#1f2a24">${escapeXml(row.date)}</text>
        <text x="${columns[1]!.x}" y="${y}" font-size="16" fill="#1f2a24">${escapeXml(clip(row.subject, 36))}</text>
        <text x="${columns[2]!.x}" y="${y}" font-size="15" fill="#33423a">${escapeXml(clip(row.from_address, 36))}</text>
        <text x="${columns[3]!.x}" y="${y}" font-size="15" fill="#33423a">${escapeXml(clip(row.to_address, 40))}</text>
        <text x="${columns[4]!.x}" y="${y}" font-size="15" fill="#33423a">${escapeXml(row.type)}</text>
        <text x="${columns[5]!.x + columns[5]!.width - 20}" y="${y}" font-size="16" fill="#1f2a24" text-anchor="end">${row.miles == null ? '' : row.miles.toFixed(1)}</text>
      `;
    })
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#fbfbf7"/>
      <text x="30" y="44" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#1f2a24">Mileage Report</text>
      <text x="30" y="72" font-family="Arial, sans-serif" font-size="17" fill="#64726a">${escapeXml(startDate)} to ${escapeXml(endDate)}</text>
      <rect x="20" y="82" width="${width - 40}" height="34" fill="#edf3ed" stroke="#c8d1c8"/>
      ${headerCells}
      ${rowCells}
      <text x="${width - 30}" y="${height - 24}" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#1f2a24" text-anchor="end">Total miles: ${totalMiles.toFixed(1)}</text>
    </svg>`;

  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not render PNG export'));
    image.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas export is unavailable');
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(svgUrl);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((pngBlob) => {
      if (pngBlob) resolve(pngBlob);
      else reject(new Error('Could not create PNG export'));
    }, 'image/png');
  });
  downloadBlob(blob, `${reportFileStem(startDate, endDate)}.png`);
}

export function MileagePage() {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(() => localDateString(new Date()));
  const [calculate, setCalculate] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pdfSavePath, setPdfSavePath] = useState<string | null>(null);
  const [manualRows, setManualRows] = useState<ManualMileageRow[]>([]);
  const [subjectOverrides, setSubjectOverrides] = useState<Record<string, string>>({});
  const [removedGeneratedRowIds, setRemovedGeneratedRowIds] = useState<Set<string>>(() => new Set());
  const [calculatingManualRowId, setCalculatingManualRowId] = useState<string | null>(null);
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
  const calculateMileage = useCalculateMileage();
  const exportMileagePdf = useExportMileagePdf();
  const rows = useMemo(() => reportQuery.data?.rows ?? [], [reportQuery.data?.rows]);
  const generatedRows = useMemo(
    () => rows
      .filter((row) => !removedGeneratedRowIds.has(row.uid))
      .map((row) => ({ ...row, subject: subjectOverrides[row.uid] ?? row.subject })),
    [removedGeneratedRowIds, rows, subjectOverrides],
  );
  const expenseRows: ExpenseMileageRow[] = useMemo(
    () => [
      ...generatedRows,
      ...manualRows.map((row) => ({
        uid: row.id,
        date: row.date,
        subject: row.subject,
        from_address: row.from_address,
        to_address: row.to_address,
        type: row.type,
        miles: row.miles,
        maps_url: '',
        distance_error: row.distance_error ?? null,
        distance_source: 'cache' as const,
        isManual: true,
      })),
    ],
    [generatedRows, manualRows],
  );
  const totalMiles = useMemo(
    () => expenseRows.reduce((sum, row) => sum + (row.miles ?? 0), 0),
    [expenseRows],
  );
  const isBusy = reportQuery.isFetching;

  function runReport(nextCalculate = calculate) {
    if (!dateRangeValid) return;
    const nextSubmitted = { startDate, endDate, calculate: nextCalculate };
    const sameReport =
      submitted.startDate === nextSubmitted.startDate &&
      submitted.endDate === nextSubmitted.endDate &&
      submitted.calculate === nextSubmitted.calculate;
    if (sameReport) {
      void reportQuery.refetch();
      return;
    }
    setSubmitted(nextSubmitted);
  }

  function addManualRow() {
    setManualRows((current) => [
      ...current,
      {
        id: `manual-${crypto.randomUUID()}`,
        date: endDate,
        subject: '',
        from_address: reportQuery.data?.from_address ?? '250 Pine St, Lino Lakes, MN 55014',
        to_address: '',
        type: 'round trip',
        miles: null,
      },
    ]);
  }

  function updateManualRow(id: string, patch: Partial<ManualMileageRow>) {
    setManualRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function updateGeneratedSubject(uid: string, subject: string) {
    setSubjectOverrides((current) => ({ ...current, [uid]: subject }));
  }

  function removeGeneratedRow(uid: string) {
    setRemovedGeneratedRowIds((current) => {
      const next = new Set(current);
      next.add(uid);
      return next;
    });
    setSubjectOverrides((current) => {
      const { [uid]: _removed, ...rest } = current;
      return rest;
    });
  }

  function removeManualRow(id: string) {
    setManualRows((current) => current.filter((row) => row.id !== id));
  }

  async function calculateManualRows(rowsToCalculate: ManualMileageRow[]) {
    for (const row of rowsToCalculate) {
      await calculateManualRow({
        uid: row.id,
        date: row.date,
        subject: row.subject,
        from_address: row.from_address,
        to_address: row.to_address,
        type: row.type,
        miles: row.miles,
        maps_url: '',
        distance_error: row.distance_error ?? null,
        distance_source: 'cache',
        isManual: true,
      });
    }
  }

  async function calculateManualRow(row: ExpenseMileageRow) {
    if (!row.from_address.trim() || !row.to_address.trim()) {
      updateManualRow(row.uid, { distance_error: 'Enter both from and to addresses.' });
      return;
    }
    setCalculatingManualRowId(row.uid);
    updateManualRow(row.uid, { distance_error: null });
    try {
      const result = await calculateMileage.mutateAsync({
        from_address: row.from_address,
        to_address: row.to_address,
      });
      updateManualRow(row.uid, {
        from_address: result.from_address,
        to_address: result.to_address,
        miles: result.miles,
        distance_error: result.distance_error,
      });
    } catch (err) {
      updateManualRow(row.uid, {
        distance_error: err instanceof Error ? err.message : 'Could not calculate manual mileage.',
      });
    } finally {
      setCalculatingManualRowId((current) => (current === row.uid ? null : current));
    }
  }

  async function handleExportPng() {
    setExportError(null);
    try {
      await exportPng(expenseRows, submitted.startDate, submitted.endDate, totalMiles);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'PNG export failed');
    }
  }

  async function handleExportPdf() {
    setExportError(null);
    setPdfSavePath(null);
    try {
      const result = await exportMileagePdf.mutateAsync({
        start_date: submitted.startDate,
        end_date: submitted.endDate,
        total_miles: totalMiles,
        rows: expenseRows.map((row) => ({
          uid: row.uid,
          date: row.date,
          subject: row.subject,
          from_address: row.from_address,
          to_address: row.to_address,
          type: row.type,
          miles: row.miles,
        })),
      });
      setPdfSavePath(result.file_path);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'PDF export failed');
    }
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
                void calculateManualRows(manualRows);
              }}
              disabled={!dateRangeValid || isBusy || calculatingManualRowId !== null}
              style={buttonStyle(!dateRangeValid || isBusy || calculatingManualRowId !== null)}
            >
              {calculatingManualRowId ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} strokeWidth={1.5} />}
              Calculate all
            </button>
            <button type="button" onClick={addManualRow} style={buttonStyle()}>
              <Plus size={14} strokeWidth={1.5} />
              Add manual entry
            </button>
            {manualRows.length > 0 && (
              <button
                type="button"
                onClick={() => void calculateManualRows(manualRows)}
                disabled={calculatingManualRowId !== null}
                style={buttonStyle(calculatingManualRowId !== null)}
              >
                {calculatingManualRowId ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} strokeWidth={1.5} />}
                Calculate manual
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={expenseRows.length === 0 || exportMileagePdf.isPending}
              style={buttonStyle(expenseRows.length === 0 || exportMileagePdf.isPending)}
            >
              {exportMileagePdf.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} strokeWidth={1.5} />}
              Export PDF
            </button>
            <button
              type="button"
              onClick={() => void handleExportPng()}
              disabled={expenseRows.length === 0}
              style={buttonStyle(expenseRows.length === 0)}
            >
              <FileImage size={14} strokeWidth={1.5} />
              Export PNG
            </button>
          </div>

          <div style={{ color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.5 }}>
            From address is fixed at 250 Pine St, Lino Lakes, MN 55014. Teams/virtual meetings and 1601 Utica Ave office
            events are filtered out. Missing miles are calculated through OpenStreetMap/OSRM and cached locally.
          </div>
          {!dateRangeValid && (
            <div style={{ color: 'var(--danger)', fontSize: 12 }}>End date must be on or after start date.</div>
          )}
          {exportError && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{exportError}</div>}
          {pdfSavePath && (
            <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>
              PDF saved to {pdfSavePath}
            </div>
          )}
        </div>

        <div style={{ padding: 16, display: 'flex', gap: 18, flexWrap: 'wrap', borderBottom: '1px solid var(--rule)' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total miles</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, color: 'var(--ink-1)' }}>
              {totalMiles.toFixed(1)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trips</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, color: 'var(--ink-1)' }}>{expenseRows.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Manual</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, color: 'var(--ink-1)' }}>{manualRows.length}</div>
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
                <th style={{ width: 180, padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'right' }}>Miles</th>
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
              ) : expenseRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 18, color: 'var(--ink-3)', fontSize: 13 }}>
                    No mileage-eligible calendar events found in this date range.
                  </td>
                </tr>
              ) : (
                expenseRows.map((row) => (
                  <tr key={row.uid}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                      {row.isManual ? (
                        <input
                          type="date"
                          value={row.date}
                          onChange={(event) => updateManualRow(row.uid, { date: event.target.value })}
                          style={{ ...fieldStyle, width: '100%' }}
                        />
                      ) : row.date}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-1)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <input
                        value={row.subject}
                        onChange={(event) => {
                          if (row.isManual) updateManualRow(row.uid, { subject: event.target.value });
                          else updateGeneratedSubject(row.uid, event.target.value);
                        }}
                        placeholder={row.isManual ? 'Manual trip' : 'Trip subject'}
                        style={{ ...fieldStyle, width: '100%' }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                      {row.isManual ? (
                        <input
                          value={row.from_address}
                          onChange={(event) => updateManualRow(row.uid, { from_address: event.target.value })}
                          style={{ ...fieldStyle, width: '100%' }}
                        />
                      ) : row.from_address}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                      {row.isManual ? (
                        <input
                          value={row.to_address}
                          onChange={(event) => updateManualRow(row.uid, { to_address: event.target.value })}
                          placeholder="Destination"
                          style={{ ...fieldStyle, width: '100%' }}
                        />
                      ) : (
                        <>
                          <span>{row.to_address}</span>{' '}
                          <a href={row.maps_url} target="_blank" rel="noreferrer" aria-label={`Open route for ${row.subject} in Google Maps`} style={{ color: 'var(--ink-3)' }}>
                            <ExternalLink size={13} strokeWidth={1.5} />
                          </a>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>{row.type}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)', textAlign: 'right', color: row.miles == null ? 'var(--ink-3)' : 'var(--ink-1)' }} title={row.isManual ? 'Manual entry' : row.distance_error ?? sourceLabel(row as MileageReportRow)}>
                      {row.isManual ? (
                        <span style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              aria-label="Calculate manual mileage"
                              onClick={() => void calculateManualRow(row)}
                              disabled={calculatingManualRowId === row.uid}
                              style={{ ...buttonStyle(calculatingManualRowId === row.uid), padding: '8px 9px' }}
                            >
                              {calculatingManualRowId === row.uid ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} strokeWidth={1.5} />}
                              Calc
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={row.miles ?? ''}
                              onChange={(event) => updateManualRow(row.uid, { miles: event.target.value === '' ? null : Number(event.target.value), distance_error: null })}
                              placeholder="0.0"
                              style={{ ...fieldStyle, width: 86, textAlign: 'right' }}
                            />
                            <button type="button" aria-label="Remove manual mileage entry" onClick={() => removeManualRow(row.uid)} style={buttonStyle()}>
                              <Trash2 size={14} strokeWidth={1.5} />
                            </button>
                          </span>
                          {row.distance_error && (
                            <span style={{ color: 'var(--danger)', fontSize: 11, textAlign: 'right' }}>
                              {row.distance_error}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <span>{formatMiles(row.miles)}</span>
                          <button
                            type="button"
                            aria-label={`Remove mileage entry: ${row.subject}`}
                            onClick={() => removeGeneratedRow(row.uid)}
                            style={{ ...buttonStyle(), padding: '7px 8px' }}
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {expenseRows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ padding: '12px', textAlign: 'right', borderTop: '1px solid var(--rule)', color: 'var(--ink-1)', fontWeight: 700 }}>
                    Total miles
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', borderTop: '1px solid var(--rule)', color: 'var(--ink-1)', fontWeight: 700 }}>
                    {totalMiles.toFixed(1)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
