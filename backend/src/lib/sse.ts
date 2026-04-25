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

  req.on('close', resolveDisconnect);

  return {
    send(payload: unknown): void {
      res.write('data: ' + JSON.stringify(payload) + '\n\n');
    },
    end(): void {
      res.write('data: [DONE]\n\n');
      res.end();
      // Ensure disconnected resolves even when we ended before the client closed.
      resolveDisconnect();
    },
    disconnected,
  };
}
