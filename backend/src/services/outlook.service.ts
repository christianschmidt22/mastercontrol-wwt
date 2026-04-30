/**
 * outlook.service.ts — Microsoft Graph client + device-code OAuth flow.
 *
 * Design decisions (ADR 0009):
 *   - Device-code flow: no localhost HTTP callback server required, avoids
 *     Windows firewall / port-binding issues, and works well for a single-user
 *     desktop app.
 *   - No Microsoft Graph SDK — plain fetch() against v1.0 endpoint.
 *   - Access token cached in module-level vars (never written to DB).
 *   - Refresh token stored DPAPI-wrapped in settings table under
 *     'outlook_refresh_token' (a SECRET_KEY).
 *
 * R-013: Errors are never logged with raw tokens or request bodies.
 *        Use the structured logger pattern (message + safe metadata only).
 */

import { settingsModel } from '../models/settings.model.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_ENDPOINT_BASE = 'https://login.microsoftonline.com';
const DEVICE_CODE_SCOPE = 'offline_access Mail.Read';

// ---------------------------------------------------------------------------
// Module-level access token cache (never persisted to DB)
// ---------------------------------------------------------------------------

let _accessToken: string | null = null;
let _accessTokenExpiresAt: number = 0; // epoch ms

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function getTenantId(): string {
  return settingsModel.get('outlook_tenant_id') ?? 'common';
}

function getClientId(): string {
  return settingsModel.get('outlook_client_id') ?? '';
}

function getRefreshToken(): string | null {
  // SECRET_KEY — retrieved as plaintext via settingsModel.get (never routes).
  return settingsModel.get('outlook_refresh_token');
}

function saveRefreshToken(token: string): void {
  settingsModel.set('outlook_refresh_token', token);
}

function saveAccountEmail(email: string): void {
  settingsModel.set('outlook_account_email', email);
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

async function fetchToken(params: Record<string, string>): Promise<TokenResponse> {
  const tenantId = getTenantId();
  const url = `${TOKEN_ENDPOINT_BASE}/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    // R-013: do not include raw body in error — it may contain tokens.
    throw new Error(`Token request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as TokenResponse;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a valid access token, refreshing from the stored refresh token if
 * the cached token is expired or within 5 minutes of expiry.
 */
export async function getGraphToken(): Promise<string> {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;

  if (_accessToken && _accessTokenExpiresAt - now > fiveMin) {
    return _accessToken;
  }

  // Refresh using stored refresh token.
  await refreshIfNeeded();

  if (!_accessToken) {
    throw new Error('No Outlook access token available. Re-authenticate via device code flow.');
  }
  return _accessToken;
}

/**
 * Refresh the access token from the stored refresh token, if available.
 * No-ops if there is no refresh token (not yet authenticated).
 */
export async function refreshIfNeeded(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return;

  const clientId = getClientId();
  if (!clientId) {
    throw new Error('outlook_client_id is not configured.');
  }

  const tokenRes = await fetchToken({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: DEVICE_CODE_SCOPE,
  });

  _accessToken = tokenRes.access_token;
  _accessTokenExpiresAt = Date.now() + tokenRes.expires_in * 1000;

  if (tokenRes.refresh_token) {
    saveRefreshToken(tokenRes.refresh_token);
  }
}

/**
 * Authenticated fetch against Microsoft Graph v1.0.
 * `path` should start with '/' (e.g. '/me/mailFolders/inbox/messages').
 */
export async function graphFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = await getGraphToken();
  const headers = new Headers(opts.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  return fetch(`${GRAPH_BASE}${path}`, {
    ...opts,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Device-code flow
// ---------------------------------------------------------------------------

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/**
 * Start a device-code auth flow. Returns the user-facing code + verification
 * URI that the caller should display to the user.
 */
export async function initiateDeviceCodeFlow(): Promise<DeviceCodeResponse> {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('outlook_client_id is not configured. Add it in Settings first.');
  }

  const tenantId = getTenantId();
  const url = `${TOKEN_ENDPOINT_BASE}/${tenantId}/oauth2/v2.0/devicecode`;

  const body = new URLSearchParams({
    client_id: clientId,
    scope: DEVICE_CODE_SCOPE,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    // R-013: do not log raw response body (may contain tokens)
    throw new Error(`Device code request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as DeviceCodeResponse;
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expires_in: data.expires_in,
    interval: data.interval,
  };
}

/**
 * Poll the token endpoint for the result of a device-code flow.
 * Returns true if the user has completed auth successfully.
 * Returns false if the auth is still pending.
 * Throws on hard errors (expired, denied, etc.).
 */
export async function pollDeviceCodeAuth(device_code: string): Promise<boolean> {
  const clientId = getClientId();
  if (!clientId) throw new Error('outlook_client_id is not configured.');

  let tokenRes: TokenResponse;
  try {
    tokenRes = await fetchToken({
      client_id: clientId,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code,
    });
  } catch (err) {
    // Check if this is a well-known "still pending" response from the token
    // endpoint. The device code flow returns 400 with error=authorization_pending
    // while the user hasn't completed sign-in yet.
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes('authorization_pending') ||
      message.includes('slow_down')
    ) {
      return false;
    }
    throw err;
  }

  // Success — cache access token and persist refresh token.
  _accessToken = tokenRes.access_token;
  _accessTokenExpiresAt = Date.now() + tokenRes.expires_in * 1000;

  if (tokenRes.refresh_token) {
    saveRefreshToken(tokenRes.refresh_token);
  }

  // Fetch and store the signed-in user's email for display purposes.
  try {
    const meRes = await graphFetch('/me?$select=mail,userPrincipalName');
    if (meRes.ok) {
      const me = (await meRes.json()) as { mail?: string; userPrincipalName?: string };
      const email = me.mail ?? me.userPrincipalName ?? '';
      if (email) saveAccountEmail(email);
    }
  } catch {
    // Non-fatal — email display is cosmetic only.
  }

  return true;
}

/**
 * Return the current Outlook connection status for the status endpoint.
 */
export async function getOutlookStatus(): Promise<{
  connected: boolean;
  email: string | null;
  last_sync: string | null;
}> {
  const refreshToken = getRefreshToken();
  const email = settingsModel.get('outlook_account_email') ?? null;
  const lastSync = settingsModel.get('last_outlook_sync_at') ?? null;

  return {
    connected: Boolean(refreshToken),
    email: email || null,
    last_sync: lastSync,
  };
}
