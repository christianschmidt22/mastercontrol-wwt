import { useState, type ClipboardEvent } from 'react';
import { X, Send, FileText, ClipboardPaste } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { CaptureActionResult } from '../../types';
import {
  clipboardImagesToCaptureAttachments,
  fileToCaptureAttachment,
  type CaptureAttachmentDraft,
} from '../../utils/captureActionFiles';

interface CaptureActionModalProps {
  open: boolean;
  attachments: CaptureAttachmentDraft[];
  prompt: string;
  isRunning: boolean;
  error: string | null;
  result: CaptureActionResult | null;
  onPromptChange: (value: string) => void;
  onAttachmentsAdd: (attachments: CaptureAttachmentDraft[]) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CaptureActionModal({
  open,
  attachments,
  prompt,
  isRunning,
  error,
  result,
  onPromptChange,
  onAttachmentsAdd,
  onClose,
  onSubmit,
}: CaptureActionModalProps) {
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [isPasting, setIsPasting] = useState(false);

  if (!open) return null;

  const canSubmit = prompt.trim().length > 0 && attachments.length > 0 && !isRunning;

  async function addFilesFromClipboard(files: File[]) {
    if (files.length === 0) {
      setPasteError('No image found on the clipboard');
      return;
    }
    setIsPasting(true);
    setPasteError(null);
    try {
      const next = await Promise.all(files.slice(0, 3).map(fileToCaptureAttachment));
      onAttachmentsAdd(next);
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : 'Could not read clipboard image');
    } finally {
      setIsPasting(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLFormElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
      .filter((file) => file.type.startsWith('image/'));

    if (files.length === 0) return;
    event.preventDefault();
    void addFilesFromClipboard(files);
  }

  async function handlePasteButton() {
    setIsPasting(true);
    setPasteError(null);
    try {
      onAttachmentsAdd(await clipboardImagesToCaptureAttachments());
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : 'Could not read clipboard image');
    } finally {
      setIsPasting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'color-mix(in srgb, var(--surface) 55%, transparent)' }}
      role="presentation"
    >
      <form
        className="w-full max-w-[640px] border"
        style={{
          background: 'var(--bg)',
          borderColor: 'var(--rule)',
          borderRadius: 8,
          color: 'var(--ink-1)',
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
        onPaste={handlePaste}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--rule)' }}
        >
          <div>
            <h2 className="m-0 text-[18px] font-semibold">Capture intake</h2>
            <p className="m-0 mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
              {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close capture intake"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md border"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink-2)' }}
          >
            <X size={16} strokeWidth={1.6} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-2">
            <div
              className="rounded-md border border-dashed px-3 py-2 text-sm"
              style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span style={{ color: 'var(--ink-2)' }}>
                  Paste an image with Ctrl+V, or use the clipboard button.
                </span>
                <button
                  type="button"
                  onClick={() => void handlePasteButton()}
                  disabled={isPasting}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                  style={{ borderColor: 'var(--rule)', color: 'var(--ink-1)' }}
                >
                  <ClipboardPaste size={15} strokeWidth={1.6} />
                  {isPasting ? 'Pasting...' : 'Paste screenshot'}
                </button>
              </div>
              {pasteError && (
                <div className="mt-2 text-xs" style={{ color: 'var(--accent)' }}>
                  {pasteError}
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex min-h-[86px] gap-3 rounded-md border p-3"
                  style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
                >
                  {attachment.preview_url ? (
                    <img
                      src={attachment.preview_url}
                      alt=""
                      className="h-14 w-20 rounded object-cover"
                    />
                  ) : (
                    <div
                      className="grid h-14 w-14 place-items-center rounded border"
                      style={{ borderColor: 'var(--rule)', color: 'var(--ink-3)' }}
                    >
                      <FileText size={18} strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{attachment.name}</div>
                    <div className="mt-1 truncate text-xs" style={{ color: 'var(--ink-3)' }}>
                      {attachment.mime_type}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              rows={5}
              className="w-full resize-y rounded-md border p-3 text-sm outline-none focus-visible:ring-2"
              style={{
                borderColor: 'var(--rule)',
                background: 'var(--surface)',
                color: 'var(--ink-1)',
                fontFamily: 'var(--body)',
              }}
            />
          </label>

          {error && (
            <div className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
              <div>{result.summary}</div>
              <div className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
                Created {result.created_tasks.length} task{result.created_tasks.length === 1 ? '' : 's'}
                {result.created_notes.length > 0
                  ? ` and ${result.created_notes.length} note${result.created_notes.length === 1 ? '' : 's'}`
                  : ''}
              </div>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-4 border-t"
          style={{ borderColor: 'var(--rule)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink-2)' }}
          >
            Close
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <Send size={15} strokeWidth={1.6} />
            {isRunning ? 'Working' : 'Run'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
