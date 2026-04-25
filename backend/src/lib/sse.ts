import type { Request, Response } from 'express';

export interface SseHandle {
  send(payload: unknown): void;
  end(): void;
  disconnected: Promise<void>;
}

/**
 * Open an SSE response channel.
 *
 * Sets the required headers, flushes the socket immediately so the browser
 * sees the connection open, and returns three primitives:
 *   - `send(payload)` — write a `data: <json>\n\n` frame.
 *   - `end()` — write the terminal `data: [DONE]\n\n` frame and end the response.
 *   - `disconnected` — resolves when the client closes the connection (req
 *     `close` event). The streaming loop can race against this promise so it
 *     stops work when the browser navigates away.
 *
 * Architecture note: the caller is responsible for writing SSE frames via
 * `send` and for calling `end` when streaming is complete. Do NOT call both
 * `end` and `res.end()` directly — `end()` handles the lifecycle.
 */
export function openSse(req: Request, res: Response): SseHandle {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Tell nginx/caddy not to buffer the stream; without this the proxy holds
  // chunks until its own buffer fills, which kills perceived streaming speed.
  res.setHeader('X-Accel-Buffering', 'no');

  // Flush headers immediately so the client connection is acknowledged before
  // the first token arrives (which may be multiple seconds away).
  res.flushHeaders();

  let resolveDisconnect!: () => void;
  const disconnected = new Promise<void>((resolve) => {
    resolveDisconnect = resolve;
  });

  // `closed` flips true only on a genuine client disconnect — we listen on
  // `res.on('close')` and gate on `!res.writableEnded`. In Node 18+ the
  // IncomingMessage's 'close' event fires when the request body finishes
  // even if the response is still streaming, which is too eager and was
  // causing SSE writes to no-op mid-stream under supertest. The Response
  // 'close' event is the right signal: it fires when the underlying
  // socket closes, and combined with the writableEnded check we can tell
  // a true abort apart from an end() we just did ourselves.
  let closed = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      closed = true;
      resolveDisconnect();
    }
  });

  return {
    send(payload: unknown): void {
      if (closed || res.writableEnded) return;
      res.write('data: ' + JSON.stringify(payload) + '\n\n');
    },
    end(): void {
      // Always finalize the response; otherwise supertest (and real clients)
      // hang waiting for the body to end.
      // - If the client disconnected (closed=true via req.close), skip the
      //   [DONE] write but still call res.end() to release server-side
      //   stream resources. res.end() is idempotent.
      // - Normal completion: write [DONE], then res.end().
      if (res.writableEnded) return;
      if (!closed) {
        res.write('data: [DONE]\n\n');
      }
      closed = true;
      res.end();
    },
    disconnected,
  };
}
