/**
 * outlook.route.ts — Outlook integration endpoints.
 *
 * Routes:
 *   GET  /api/outlook/status        → { connected, email, last_sync }
 *   POST /api/outlook/auth-start    → initiates device code; returns { user_code, verification_uri, expires_in }
 *   GET  /api/outlook/auth-poll     → { status: 'pending' | 'success' | 'error' }
 *   POST /api/outlook/sync-now      → triggers immediate sync; returns { ok: true }
 *   GET  /api/outlook/messages      → OutlookMessage[] filtered by org_id
 *
 * R-013: Errors go through next(err) — never log req.body or raw error objects.
 */

import { Router } from 'express';
import { validateQuery } from '../lib/validate.js';
import {
  getOutlookStatus,
  initiateDeviceCodeFlow,
  pollDeviceCodeAuth,
} from '../services/outlook.service.js';
import { syncOutlook } from '../services/outlookSync.service.js';
import { outlookMessageModel } from '../models/outlookMessage.model.js';
import { OutlookMessagesQuerySchema } from '../schemas/outlook.schema.js';

export const outlookRouter = Router();

// ---------------------------------------------------------------------------
// Module-level device-code state
// Short-lived (tied to the life of a single auth flow).
// The server polls the token endpoint on the client's behalf so the
// device_code (a sensitive token) never reaches the browser.
// ---------------------------------------------------------------------------

interface DeviceCodeState {
  device_code: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

let _deviceCodeState: DeviceCodeState | null = null;

// ---------------------------------------------------------------------------
// GET /api/outlook/status
// ---------------------------------------------------------------------------

outlookRouter.get('/status', (_req, res, next) => {
  getOutlookStatus()
    .then((status) => res.json(status))
    .catch(next);
});

// ---------------------------------------------------------------------------
// POST /api/outlook/auth-start
// Initiates a device-code flow. Returns the user-facing code + verification
// URI. The device_code is stored server-side; the client only polls /auth-poll.
// ---------------------------------------------------------------------------

outlookRouter.post('/auth-start', (_req, res, next) => {
  initiateDeviceCodeFlow()
    .then((data) => {
      // Store the device_code server-side; do NOT send it to the client.
      _deviceCodeState = { device_code: data.device_code, status: 'pending' };

      // Start background polling at the interval the IdP specified.
      const intervalMs = Math.max((data.interval ?? 5) * 1000, 5000);

      const poll = setInterval(() => {
        if (!_deviceCodeState || _deviceCodeState.status !== 'pending') {
          clearInterval(poll);
          return;
        }
        pollDeviceCodeAuth(_deviceCodeState.device_code)
          .then((success) => {
            if (success && _deviceCodeState) {
              _deviceCodeState.status = 'success';
              clearInterval(poll);
            }
          })
          .catch((err) => {
            if (_deviceCodeState) {
              _deviceCodeState.status = 'error';
              _deviceCodeState.error =
                err instanceof Error ? err.message : 'Auth failed';
            }
            clearInterval(poll);
          });
      }, intervalMs);

      // Automatically stop polling when the code expires.
      setTimeout(() => {
        clearInterval(poll);
        if (_deviceCodeState?.status === 'pending') {
          _deviceCodeState.status = 'error';
          _deviceCodeState.error = 'Device code expired';
        }
      }, data.expires_in * 1000);

      res.json({
        user_code: data.user_code,
        verification_uri: data.verification_uri,
        expires_in: data.expires_in,
      });
    })
    .catch(next);
});

// ---------------------------------------------------------------------------
// GET /api/outlook/auth-poll
// Returns the current state of the ongoing device-code auth attempt.
// ---------------------------------------------------------------------------

outlookRouter.get('/auth-poll', (req, res, next) => {
  try {
    if (!_deviceCodeState) {
      return res.json({ status: 'error', message: 'No active auth flow' });
    }
    const { status, error } = _deviceCodeState;
    if (status === 'success') {
      // Clear state after the client acknowledges success.
      _deviceCodeState = null;
    }
    return res.json({ status, ...(error ? { message: error } : {}) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/outlook/sync-now
// ---------------------------------------------------------------------------

outlookRouter.post('/sync-now', (_req, res, next) => {
  syncOutlook()
    .then(() => res.json({ ok: true }))
    .catch(next);
});

// ---------------------------------------------------------------------------
// GET /api/outlook/messages?org_id=N&limit=20
// ---------------------------------------------------------------------------

outlookRouter.get(
  '/messages',
  validateQuery(OutlookMessagesQuerySchema),
  (req, res, next) => {
    try {
      const { org_id, limit } = req.validated as { org_id: number; limit: number };
      const messages = outlookMessageModel.findByOrg(org_id, limit);
      res.json(messages);
    } catch (err) {
      next(err);
    }
  },
);
