/**
 * sse.test.ts
 *
 * Tests for openSse — verifies headers, send(), end(), and the
 * disconnected promise.  Uses mock req/res objects; no real HTTP.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { openSse } from './sse.js';

// ---------------------------------------------------------------------------
// Helpers: build mock req/res
// ---------------------------------------------------------------------------

interface MockRes {
  setHeader: ReturnType<typeof vi.fn>;
  flushHeaders: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

interface MockReq {
  on: ReturnType<typeof vi.fn>;
  emit: (event: string) => void;
  _listeners: Map<string, Array<() => void>>;
}

function makeMockRes(): MockRes {
  return {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
}

function makeMockReq(): MockReq {
  const listeners = new Map<string, Array<() => void>>();
  return {
    _listeners: listeners,
    on: vi.fn((event: string, cb: () => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(cb);
      listeners.set(event, arr);
    }),
    emit(event: string) {
      for (const cb of listeners.get(event) ?? []) cb();
    },
  };
}

// ---------------------------------------------------------------------------
// openSse — headers
// ---------------------------------------------------------------------------

describe('openSse — HTTP headers', () => {
  it('sets Content-Type to text/event-stream', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    openSse(req as unknown as Request, res as unknown as Response);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
  });

  it('sets Cache-Control to no-cache', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    openSse(req as unknown as Request, res as unknown as Response);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
  });

  it('sets Connection to keep-alive', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    openSse(req as unknown as Request, res as unknown as Response);
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
  });

  it('sets X-Accel-Buffering to no', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    openSse(req as unknown as Request, res as unknown as Response);
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
  });

  it('calls flushHeaders to send headers immediately', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    openSse(req as unknown as Request, res as unknown as Response);
    expect(res.flushHeaders).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// openSse — send()
// ---------------------------------------------------------------------------

describe('openSse — send()', () => {
  it('writes data: <json>\\n\\n for an object payload', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const sse = openSse(req as unknown as Request, res as unknown as Response);

    sse.send({ type: 'text', delta: 'hello' });

    expect(res.write).toHaveBeenCalledOnce();
    const written = res.write.mock.calls[0][0] as string;
    expect(written).toBe('data: {"type":"text","delta":"hello"}\n\n');
  });

  it('JSON-encodes the payload (not toString)', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const sse = openSse(req as unknown as Request, res as unknown as Response);

    sse.send({ nested: { a: 1 }, arr: [1, 2] });

    const written = res.write.mock.calls[0][0] as string;
    expect(written).toMatch(/^data: /);
    const jsonPart = written.slice('data: '.length).trimEnd();
    const parsed = JSON.parse(jsonPart) as { nested: { a: number }; arr: number[] };
    expect(parsed.nested.a).toBe(1);
    expect(parsed.arr).toEqual([1, 2]);
  });

  it('can send multiple frames without calling end()', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const sse = openSse(req as unknown as Request, res as unknown as Response);

    sse.send({ type: 'text', delta: 'chunk1' });
    sse.send({ type: 'text', delta: 'chunk2' });

    expect(res.write).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// openSse — end()
// ---------------------------------------------------------------------------

describe('openSse — end()', () => {
  it('writes data: [DONE]\\n\\n then calls res.end()', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const sse = openSse(req as unknown as Request, res as unknown as Response);

    sse.end();

    expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(res.end).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// openSse — disconnected promise
// ---------------------------------------------------------------------------

describe('openSse — disconnected promise', () => {
  it('resolves when req emits close event', async () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const sse = openSse(req as unknown as Request, res as unknown as Response);

    let resolved = false;
    sse.disconnected.then(() => { resolved = true; }).catch(() => {});

    expect(resolved).toBe(false);

    // Emit close — the promise should resolve
    req.emit('close');

    // Flush microtask queue
    await Promise.resolve();

    expect(resolved).toBe(true);
  });

  it('resolves disconnected when end() is called before client closes', async () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const sse = openSse(req as unknown as Request, res as unknown as Response);

    let resolved = false;
    sse.disconnected.then(() => { resolved = true; }).catch(() => {});

    sse.end();

    await Promise.resolve();

    expect(resolved).toBe(true);
  });

  it('registers req.on("close") listener exactly once', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    openSse(req as unknown as Request, res as unknown as Response);
    expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(req.on).toHaveBeenCalledOnce();
  });
});
