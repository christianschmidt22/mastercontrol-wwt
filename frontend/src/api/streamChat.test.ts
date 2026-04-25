/**
 * Unit tests for the streamChat SSE consumer.
 *
 * Mocks global.fetch to return a ReadableStream constructed from string chunks.
 * No network is involved. Vitest globals are disabled; everything is imported
 * explicitly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamChat } from './streamChat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/** Build a fake Response whose body streams the provided string chunks. */
function fakeResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

/** Format a single SSE frame from a JSON-stringifiable value. */
function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('streamChat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('calls onText for each text delta and onDone once on [DONE]', async () => {
    const chunks = [
      sseFrame({ type: 'text', delta: 'Hello' }),
      sseFrame({ type: 'text', delta: ' world' }),
      'data: [DONE]\n\n',
    ];

    vi.mocked(fetch).mockResolvedValueOnce(fakeResponse(chunks));

    const onText = vi.fn();
    const onDone = vi.fn();

    await streamChat({ orgId: 1, content: 'hi', onText, onDone });

    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onText).toHaveBeenNthCalledWith(2, ' world');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Tool-use frame
  // -------------------------------------------------------------------------

  it('calls onToolUse for tool_use frames', async () => {
    const chunks = [
      sseFrame({ type: 'tool_use', tool: 'web_search', input: { q: 'x' } }),
      'data: [DONE]\n\n',
    ];

    vi.mocked(fetch).mockResolvedValueOnce(fakeResponse(chunks));

    const onToolUse = vi.fn();
    const onText = vi.fn();

    await streamChat({ orgId: 1, content: 'search', onText, onToolUse });

    expect(onToolUse).toHaveBeenCalledTimes(1);
    expect(onToolUse).toHaveBeenCalledWith({ tool: 'web_search', input: { q: 'x' } });
    expect(onText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Abort mid-stream
  // -------------------------------------------------------------------------

  it('rejects with AbortError and does not call onDone when aborted', async () => {
    const ctrl = new AbortController();

    // The stream emits the first chunk; we abort after receiving it
    let enqueued = false;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (!enqueued) {
          enqueued = true;
          controller.enqueue(encoder.encode(sseFrame({ type: 'text', delta: 'partial' })));
          // Abort after enqueuing the first chunk
          ctrl.abort();
          // Enqueue a second chunk that should never be processed
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const onText = vi.fn();
    const onDone = vi.fn();

    const promise = streamChat({
      orgId: 1,
      content: 'hi',
      onText,
      onDone,
      signal: ctrl.signal,
    });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(onDone).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Multi-frame buffer: JSON payload split across two reader chunks
  // -------------------------------------------------------------------------

  it('correctly parses a frame whose JSON is split across two reader chunks', async () => {
    // Craft a single SSE frame and split its raw bytes across two enqueue calls
    const fullFrame = sseFrame({ type: 'text', delta: 'split-delta' });
    const midpoint = Math.floor(fullFrame.length / 2);
    const part1 = fullFrame.slice(0, midpoint);
    const part2 = fullFrame.slice(midpoint) + 'data: [DONE]\n\n';

    vi.mocked(fetch).mockResolvedValueOnce(fakeResponse([part1, part2]));

    const onText = vi.fn();
    const onDone = vi.fn();

    await streamChat({ orgId: 1, content: 'hi', onText, onDone });

    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith('split-delta');
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
