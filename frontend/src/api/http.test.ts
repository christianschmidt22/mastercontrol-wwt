/**
 * http.test.ts
 *
 * Tests for the `request` fetch wrapper.
 * global.fetch is mocked — no network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request } from './http';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function make204Response(): Response {
  return new Response(null, { status: 204, statusText: 'No Content' });
}

function makeErrorResponse(status: number, body: { error?: string }): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('request() — happy path', () => {
  it('returns parsed JSON body on 200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonResponse({ id: 1, name: 'Fairview' }),
    );

    const result = await request<{ id: number; name: string }>('GET', '/api/organizations/1');

    expect(result).toEqual({ id: 1, name: 'Fairview' });
  });

  it('sends method, Content-Type header, and JSON body for POST', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse({ id: 99 }, 201));

    await request('POST', '/api/organizations', { type: 'customer', name: 'New Org' });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/organizations');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ type: 'customer', name: 'New Org' }));
  });

  it('returns undefined for 204 No Content', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(make204Response());

    const result = await request<void>('DELETE', '/api/organizations/1');

    expect(result).toBeUndefined();
  });

  it('does not include body for GET requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse([]));

    await request('GET', '/api/organizations');

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.body).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error handling — 4xx
// ---------------------------------------------------------------------------

describe('request() — 4xx errors', () => {
  it('throws Error with message from JSON body on 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeErrorResponse(400, { error: 'Invalid request body — name: required' }),
    );

    await expect(
      request('POST', '/api/organizations', { type: 'customer' }),
    ).rejects.toThrow('Invalid request body — name: required');
  });

  it('throws Error with message from JSON body on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeErrorResponse(404, { error: 'Not found' }),
    );

    await expect(request('GET', '/api/organizations/9999')).rejects.toThrow('Not found');
  });

  it('falls back to statusText when JSON body has no error field', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ other: 'field' }), {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(request('GET', '/api/test')).rejects.toThrow('Bad Request');
  });

  it('falls back to statusText when JSON parse fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('not json', {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    await expect(request('GET', '/api/test')).rejects.toThrow('Bad Request');
  });
});

// ---------------------------------------------------------------------------
// Error handling — 5xx
// ---------------------------------------------------------------------------

describe('request() — 5xx errors', () => {
  it('throws Error with message from JSON body on 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeErrorResponse(500, { error: 'Internal server error' }),
    );

    await expect(request('GET', '/api/broken')).rejects.toThrow('Internal server error');
  });

  it('includes status code information on 503', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 503, statusText: 'Service Unavailable' }),
    );

    await expect(request('GET', '/api/unavailable')).rejects.toThrow('Service Unavailable');
  });
});

// ---------------------------------------------------------------------------
// Network error
// ---------------------------------------------------------------------------

describe('request() — network error', () => {
  it('propagates fetch rejection (network failure)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(request('GET', '/api/organizations')).rejects.toThrow('Failed to fetch');
  });

  it('propagates connection refused error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(request('GET', '/api/organizations')).rejects.toThrow('ECONNREFUSED');
  });
});
