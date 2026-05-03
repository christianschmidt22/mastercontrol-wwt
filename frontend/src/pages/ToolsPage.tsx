import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from 'react';
import { Clipboard, Columns3, FileText, Loader2, MoveRight, RefreshCw, Search, Upload } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { MarkdownViewer } from '../components/shared/MarkdownViewer';
import { useOrganizations } from '../api/useOrganizations';
import { useAnalyzeBomFiles, useBomFiles, useMoveBomFiles, useUploadBomFiles } from '../api/useBomTool';
import { fileToCaptureAttachment } from '../utils/captureActionFiles';
import type { BomToolFile } from '../types';

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

type FileColumnKey = 'file' | 'type' | 'size' | 'modified';

const fileColumns: Array<{
  key: FileColumnKey;
  label: string;
  minWidth: number;
  align: 'left' | 'right';
}> = [
  { key: 'file', label: 'File', minWidth: 220, align: 'left' },
  { key: 'type', label: 'Type', minWidth: 70, align: 'left' },
  { key: 'size', label: 'Size', minWidth: 84, align: 'right' },
  { key: 'modified', label: 'Modified', minWidth: 120, align: 'right' },
];

const defaultColumnWidths: Record<FileColumnKey, number> = {
  file: 360,
  type: 90,
  size: 110,
  modified: 150,
};

const defaultVisibleColumns: Record<FileColumnKey, boolean> = {
  file: true,
  type: true,
  size: true,
  modified: true,
};

const analysisMessages = [
  'Preparing selected files for Claude Code...',
  'Inspecting file contents and workbook structure...',
  'Extracting BOM details, risks, and missing data...',
  'Building copy/paste customer, internal, and vendor outputs...',
];

type OutputMode = 'preview' | 'raw';

interface StoredBomToolState {
  organization_id: number;
  prompt: string;
  output: string;
  output_mode: OutputMode;
}

const BOM_TOOL_STATE_KEY = 'mastercontrol.bomTool.lastState.v1';
const DEFAULT_BOM_PROMPT =
  'Analyze the selected BOMs, quotes, and configs. Call out risks, missing data, and generate customer/internal/vendor copy-paste outputs.';

function readStoredBomToolState(): StoredBomToolState | null {
  try {
    const raw = window.localStorage.getItem(BOM_TOOL_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBomToolState>;
    if (typeof parsed.organization_id !== 'number') return null;
    return {
      organization_id: parsed.organization_id,
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : DEFAULT_BOM_PROMPT,
      output: typeof parsed.output === 'string' ? parsed.output : '',
      output_mode: parsed.output_mode === 'raw' ? 'raw' : 'preview',
    };
  } catch {
    return null;
  }
}

function writeStoredBomToolState(state: StoredBomToolState): void {
  window.localStorage.setItem(BOM_TOOL_STATE_KEY, JSON.stringify(state));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatModified(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

async function filesToUpload(files: File[]) {
  const attachments = await Promise.all(files.map(fileToCaptureAttachment));
  return attachments.map(({ name, mime_type, data_base64 }) => ({
    name,
    mime_type,
    data_base64,
  }));
}

interface FileTableProps {
  files: BomToolFile[];
  selected: Set<string>;
  columnWidths: Record<FileColumnKey, number>;
  visibleColumns: Record<FileColumnKey, boolean>;
  onToggle: (name: string) => void;
  onResizeStart: (key: FileColumnKey, event: PointerEvent<HTMLSpanElement>) => void;
}

function renderFileCell(file: BomToolFile, column: FileColumnKey) {
  if (column === 'file') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <FileText size={15} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--ink-3)' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </span>
      </div>
    );
  }
  if (column === 'type') return file.extension || 'file';
  if (column === 'size') return formatBytes(file.size_bytes);
  return formatModified(file.modified_at);
}

function FileTable({
  files,
  selected,
  columnWidths,
  visibleColumns,
  onToggle,
  onResizeStart,
}: FileTableProps) {
  if (files.length === 0) {
    return (
      <div style={{ padding: 18, color: 'var(--ink-3)', fontSize: 13 }}>
        No matching BOMs, quotes, or configs yet.
      </div>
    );
  }

  const columns = fileColumns.filter((column) => visibleColumns[column.key]);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <thead>
        <tr style={{ color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase' }}>
          <th style={{ width: 42, padding: '9px 10px', borderBottom: '1px solid var(--rule)' }} />
          {columns.map((column) => (
            <th
              key={column.key}
              style={{
                width: columnWidths[column.key],
                minWidth: column.minWidth,
                textAlign: column.align,
                padding: '9px 10px',
                borderBottom: '1px solid var(--rule)',
                position: 'relative',
              }}
            >
              {column.label}
              <span
                role="separator"
                aria-label={`Resize ${column.label} column`}
                onPointerDown={(event) => onResizeStart(column.key, event)}
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 0,
                  width: 8,
                  height: 24,
                  cursor: 'col-resize',
                  borderRight: '1px solid var(--rule)',
                }}
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {files.map((file) => (
          <tr key={file.name}>
            <td style={{ padding: '9px 10px', borderBottom: '1px solid var(--rule)' }}>
              <input
                type="checkbox"
                checked={selected.has(file.name)}
                onChange={() => onToggle(file.name)}
                aria-label={`Select ${file.name}`}
              />
            </td>
            {columns.map((column) => (
              <td
                key={column.key}
                style={{
                  width: columnWidths[column.key],
                  minWidth: column.minWidth,
                  padding: '9px 10px',
                  borderBottom: '1px solid var(--rule)',
                  textAlign: column.align,
                  color: column.key === 'file' ? 'var(--ink-1)' : 'var(--ink-2)',
                  minInlineSize: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {renderFileCell(file, column.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ToolsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const restoredState = useMemo(() => readStoredBomToolState(), []);
  const [organizationId, setOrganizationId] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState(restoredState?.prompt ?? DEFAULT_BOM_PROMPT);
  const [output, setOutput] = useState(restoredState?.output ?? '');
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [moveTargetOrgId, setMoveTargetOrgId] = useState('');
  const [columnWidths, setColumnWidths] = useState(defaultColumnWidths);
  const [visibleColumns, setVisibleColumns] = useState(defaultVisibleColumns);
  const [analysisActivity, setAnalysisActivity] = useState<string | null>(null);
  const [outputMode, setOutputMode] = useState<OutputMode>(restoredState?.output_mode ?? 'preview');

  const customersQuery = useOrganizations('customer');
  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);
  const selectedOrgId = Number(organizationId) || 0;
  const filesQuery = useBomFiles(selectedOrgId);
  const upload = useUploadBomFiles();
  const analyze = useAnalyzeBomFiles();
  const moveFiles = useMoveBomFiles();

  useEffect(() => {
    if (organizationId) return;
    const restoredCustomer = restoredState
      ? customers.find((customer) => customer.id === restoredState.organization_id)
      : undefined;
    const initialCustomer = restoredCustomer ?? customers[0];
    if (initialCustomer) setOrganizationId(String(initialCustomer.id));
  }, [customers, organizationId, restoredState]);

  useEffect(() => {
    setSelectedFiles(new Set());
    setMessage(null);
  }, [selectedOrgId]);

  useEffect(() => {
    if (selectedOrgId <= 0) return;
    writeStoredBomToolState({
      organization_id: selectedOrgId,
      prompt,
      output,
      output_mode: outputMode,
    });
  }, [output, outputMode, prompt, selectedOrgId]);

  useEffect(() => {
    const fallbackTarget = customers.find((customer) => customer.id !== selectedOrgId);
    const fairviewTarget = customers.find(
      (customer) => customer.id !== selectedOrgId && customer.name.toLowerCase().includes('fairview'),
    );
    const currentTargetStillValid = customers.some(
      (customer) => customer.id === Number(moveTargetOrgId) && customer.id !== selectedOrgId,
    );
    if (!currentTargetStillValid) {
      setMoveTargetOrgId(String((fairviewTarget ?? fallbackTarget)?.id ?? ''));
    }
  }, [customers, moveTargetOrgId, selectedOrgId]);

  useEffect(() => {
    if (!analyze.isPending) return undefined;
    let index = 0;
    setAnalysisActivity(analysisMessages[index] ?? 'Claude Code is working...');
    const interval = window.setInterval(() => {
      index = (index + 1) % analysisMessages.length;
      setAnalysisActivity(analysisMessages[index] ?? 'Claude Code is working...');
    }, 3500);
    return () => window.clearInterval(interval);
  }, [analyze.isPending]);

  const filteredFiles = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const files = filesQuery.data?.files ?? [];
    if (!needle) return files;
    return files.filter((file) => file.name.toLowerCase().includes(needle));
  }, [filesQuery.data?.files, filter]);

  const selectedCount = selectedFiles.size;
  const isBusy = upload.isPending || analyze.isPending || moveFiles.isPending;

  function toggleFile(name: string) {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleUpload(files: File[]) {
    if (selectedOrgId <= 0 || files.length === 0) return;
    setMessage(null);
    try {
      await upload.mutateAsync({
        organization_id: selectedOrgId,
        files: await filesToUpload(files),
      });
      setMessage(`Stored ${files.length} file${files.length === 1 ? '' : 's'} in quotes_configs.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  function startColumnResize(key: FileColumnKey, event: PointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidths[key];
    const minWidth = fileColumns.find((column) => column.key === key)?.minWidth ?? 70;

    function handleMove(moveEvent: globalThis.PointerEvent) {
      const delta = moveEvent.clientX - startX;
      setColumnWidths((current) => ({
        ...current,
        [key]: Math.max(minWidth, startWidth + delta),
      }));
    }

    function handleUp() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  function toggleColumn(key: FileColumnKey) {
    if (key === 'file') return;
    setVisibleColumns((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function moveSelectedFiles() {
    const targetId = Number(moveTargetOrgId);
    if (selectedOrgId <= 0 || targetId <= 0 || selectedCount === 0) return;
    setMessage(null);
    try {
      const result = await moveFiles.mutateAsync({
        from_organization_id: selectedOrgId,
        to_organization_id: targetId,
        file_names: Array.from(selectedFiles),
      });
      setSelectedFiles(new Set());
      setMessage(`Moved ${result.moved_files.length} file${result.moved_files.length === 1 ? '' : 's'} to ${result.to.organization_name}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Move failed');
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleUpload(Array.from(event.dataTransfer.files));
  }

  async function runAnalysis() {
    if (selectedOrgId <= 0 || selectedCount === 0) return;
    setMessage(null);
    setOutput('');
    setAnalysisActivity('Preparing selected files for Claude Code...');
    try {
      const result = await analyze.mutateAsync({
        organization_id: selectedOrgId,
        file_names: Array.from(selectedFiles),
        prompt,
      });
      setOutput(result.output);
      setOutputMode('preview');
      setAnalysisActivity('Analysis complete.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'BOM analysis failed');
      setAnalysisActivity(null);
    }
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setMessage('Copied analysis output.');
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tools"
        title="BOM Analyzer"
        subtitle="Drop customer BOMs, quotes, and configs, then ask Claude to analyze the selected files with the BOM skill guidance."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20 }}>
        <section style={panelStyle}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--rule)', display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) 1fr auto', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Customer
                <select
                  value={organizationId}
                  onChange={(event) => setOrganizationId(event.target.value)}
                  style={fieldStyle}
                  disabled={customersQuery.isLoading}
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Filter files
                <span style={{ position: 'relative', display: 'block' }}>
                  <Search size={14} strokeWidth={1.5} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-3)' }} />
                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Search filename"
                    style={{ ...fieldStyle, width: '100%', paddingLeft: 30 }}
                  />
                </span>
              </label>
              <button
                type="button"
                onClick={() => void filesQuery.refetch()}
                disabled={selectedOrgId <= 0 || filesQuery.isFetching}
                style={buttonStyle(selectedOrgId <= 0 || filesQuery.isFetching)}
              >
                <RefreshCw size={14} strokeWidth={1.5} />
                Refresh
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Move selected to
                </span>
                <select
                  value={moveTargetOrgId}
                  onChange={(event) => setMoveTargetOrgId(event.target.value)}
                  style={{ ...fieldStyle, minWidth: 210 }}
                  disabled={customers.length <= 1}
                >
                  {customers
                    .filter((customer) => customer.id !== selectedOrgId)
                    .map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => void moveSelectedFiles()}
                  disabled={selectedCount === 0 || Number(moveTargetOrgId) <= 0 || isBusy}
                  style={buttonStyle(selectedCount === 0 || Number(moveTargetOrgId) <= 0 || isBusy)}
                >
                  {moveFiles.isPending ? <Loader2 size={14} className="animate-spin" /> : <MoveRight size={14} strokeWidth={1.5} />}
                  Move
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <Columns3 size={14} strokeWidth={1.5} />
                  Columns
                </span>
                {fileColumns.map((column) => (
                  <label key={column.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-2)' }}>
                    <input
                      type="checkbox"
                      checked={visibleColumns[column.key]}
                      disabled={column.key === 'file'}
                      onChange={() => toggleColumn(column.key)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              style={{
                border: dragging ? '1px solid var(--accent)' : '1px dashed var(--rule)',
                borderRadius: 6,
                padding: 18,
                background: dragging ? 'var(--bg-2)' : 'var(--bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                <Upload size={18} strokeWidth={1.5} style={{ color: 'var(--ink-2)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink-1)' }}>Drop BOMs, quotes, or configs here</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Files store under the selected customer folder in quotes_configs.
                  </div>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.pdf,.txt,.doc,.docx"
                style={{ display: 'none' }}
                onChange={(event) => {
                  void handleUpload(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={selectedOrgId <= 0 || upload.isPending}
                style={buttonStyle(selectedOrgId <= 0 || upload.isPending)}
              >
                Browse
              </button>
            </div>

            {message && <div style={{ color: message.includes('failed') || message.includes('larger') ? 'var(--danger)' : 'var(--ink-2)', fontSize: 12 }}>{message}</div>}
            {filesQuery.data?.directory && (
              <div style={{ color: 'var(--ink-3)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Storage: {filesQuery.data.directory}
              </div>
            )}
          </div>

          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 430px)', minHeight: 260 }}>
            {filesQuery.isLoading ? (
              <div style={{ padding: 18, display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ink-3)' }}>
                <Loader2 size={15} className="animate-spin" />
                Loading files
              </div>
            ) : (
              <FileTable
                files={filteredFiles}
                selected={selectedFiles}
                columnWidths={columnWidths}
                visibleColumns={visibleColumns}
                onToggle={toggleFile}
                onResizeStart={startColumnResize}
              />
            )}
          </div>
        </section>

        <section style={{ ...panelStyle, display: 'grid', gridTemplateRows: 'auto minmax(260px, 1fr)' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--rule)', display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Prompt
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                style={{ ...fieldStyle, width: '100%', resize: 'vertical', lineHeight: 1.45 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: analyze.isPending ? 'var(--ink-2)' : 'var(--ink-3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
                {analyze.isPending && <Loader2 size={13} className="animate-spin" />}
                {analyze.isPending ? analysisActivity : `${selectedCount} selected for analysis`}
              </div>
              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={selectedOrgId <= 0 || selectedCount === 0 || isBusy}
                style={buttonStyle(selectedOrgId <= 0 || selectedCount === 0 || isBusy)}
              >
                {analyze.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} strokeWidth={1.5} />}
                Analyze selected
              </button>
            </div>
          </div>

          <div style={{ padding: 16, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 20, fontWeight: 600, color: 'var(--ink-1)' }}>
                Copy/Paste Output
              </h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div role="tablist" aria-label="BOM output view" style={{ display: 'inline-flex', border: '1px solid var(--rule)', borderRadius: 5, overflow: 'hidden' }}>
                  {(['preview', 'raw'] as OutputMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={outputMode === mode}
                      onClick={() => setOutputMode(mode)}
                      style={{
                        border: 0,
                        borderRight: mode === 'preview' ? '1px solid var(--rule)' : 0,
                        background: outputMode === mode ? 'var(--bg-2)' : 'var(--bg)',
                        color: outputMode === mode ? 'var(--ink-1)' : 'var(--ink-2)',
                        cursor: 'pointer',
                        fontFamily: 'var(--body)',
                        fontSize: 12,
                        padding: '7px 10px',
                        textTransform: 'capitalize',
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => void copyOutput()} disabled={!output} style={buttonStyle(!output)}>
                  <Clipboard size={14} strokeWidth={1.5} />
                  Copy Markdown
                </button>
              </div>
            </div>
            {output && outputMode === 'preview' ? (
              <div
                style={{
                  border: '1px solid var(--rule)',
                  borderRadius: 5,
                  background: 'var(--bg)',
                  minHeight: 360,
                  maxHeight: 'calc(100vh - 390px)',
                  overflow: 'auto',
                  padding: 16,
                }}
              >
                <MarkdownViewer
                  source={output}
                  ariaLabel="Rendered BOM analysis output"
                  className="bom-output-prose"
                />
              </div>
            ) : (
              <textarea
                readOnly
                value={output || (analyze.isPending ? `${analysisActivity ?? 'Claude Code is working...'}\n\nThe analysis request is still running. The final report will replace this status text when Claude returns.` : '')}
                placeholder="Claude's BOM analysis and reusable output blocks will appear here."
                style={{
                  ...fieldStyle,
                  width: '100%',
                  minHeight: 360,
                  resize: 'vertical',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--mono, Consolas, monospace)',
                }}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
