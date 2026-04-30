/**
 * outlook.service.ts — Outlook COM automation via PowerShell.
 *
 * Design decisions (ADR 0009):
 *   - Reads from the locally running Outlook desktop app via COM
 *     (System.Runtime.InteropServices.Marshal.GetActiveObject).
 *   - No Azure app registration, no OAuth, no tokens.
 *   - Node.js spawns powershell.exe with the outlook-fetch.ps1 script;
 *     stdout is a JSON blob parsed here.
 *   - If Outlook is not running, ensureOutlookRunning() launches it and waits
 *     up to 30s for COM to become accessible before proceeding with fetch.
 *   - If Outlook fails to become accessible or spawn fails, returns an empty
 *     result rather than throwing — the sync scheduler treats it as a no-op.
 *
 * R-013: Errors are never logged with raw process output or request bodies.
 *        Use structured log messages (counts, status codes, safe metadata).
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { settingsModel } from '../models/settings.model.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawOutlookMessage {
  internet_message_id: string;
  subject: string;
  from_email: string;
  from_name: string;
  to_emails: string[];
  cc_emails: string[];
  sent_at: string;
  has_attachments: number;
  body_preview: string;
}

interface Ps1Result {
  error: string | null;
  messages: RawOutlookMessage[];
}

interface LaunchResult {
  launched: boolean;
  ready: boolean;
  weStartedIt: boolean;
  error: string | null;
}

export interface EnsureResult {
  ready: boolean;
  weStartedIt: boolean;
}

// ---------------------------------------------------------------------------
// PS1 paths — resolved once at module load time (ESM import.meta.url)
// ---------------------------------------------------------------------------

const PS1_PATH = fileURLToPath(
  new URL('../scripts/outlook-fetch.ps1', import.meta.url),
);

const LAUNCH_PS1_PATH = fileURLToPath(
  new URL('../scripts/outlook-launch.ps1', import.meta.url),
);

const CLOSE_PS1_PATH = fileURLToPath(
  new URL('../scripts/outlook-close.ps1', import.meta.url),
);

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Spawn the PowerShell script and return its parsed output.
 * Never throws — on any error returns { error: <message>, messages: [] }.
 */
async function runPs1(limit: number): Promise<Ps1Result> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const child = spawn('powershell.exe', [
      '-NonInteractive',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      PS1_PATH,
      '-Limit',
      String(limit),
    ]);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      // spawn itself failed (e.g. powershell.exe not found)
      console.warn('[outlook.service] spawn error', { message: err.message });
      resolve({ error: err.message, messages: [] });
    });

    child.on('close', () => {
      if (stderr.trim()) {
        // Log stderr length only — R-013: never log raw content
        console.warn('[outlook.service] ps1 stderr', { bytes: stderr.length });
      }

      if (!stdout.trim()) {
        resolve({ error: 'No output from PowerShell script', messages: [] });
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as Ps1Result;
        resolve(parsed);
      } catch {
        console.warn('[outlook.service] JSON parse failed', {
          outputBytes: stdout.length,
        });
        resolve({ error: 'Failed to parse PowerShell output', messages: [] });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensures Outlook is running and COM-accessible.
 * - If classic Outlook (OUTLOOK.EXE) is already running, uses it as-is.
 * - If it is not running, launches it minimized and waits up to 30s.
 * Returns { ready, weStartedIt } so the caller can close Outlook when done
 * if and only if this call was the one that started it.
 * Never throws.
 */
export async function ensureOutlookRunning(): Promise<EnsureResult> {
  return new Promise((resolve) => {
    let stdout = '';

    const child = spawn('powershell.exe', [
      '-NonInteractive',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      LAUNCH_PS1_PATH,
      '-TimeoutSeconds',
      '30',
    ]);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.on('close', () => {
      try {
        const result = JSON.parse(stdout.trim()) as LaunchResult;
        resolve({ ready: result.ready, weStartedIt: result.weStartedIt });
      } catch {
        resolve({ ready: false, weStartedIt: false });
      }
    });

    child.on('error', () => resolve({ ready: false, weStartedIt: false }));
  });
}

/**
 * Closes classic Outlook via Application.Quit() if and only if this sync
 * session started it. If the user had Outlook open before sync, this is a
 * no-op. Never throws.
 */
export async function closeOutlookIfWeStartedIt(weStartedIt: boolean): Promise<void> {
  if (!weStartedIt) return;
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', [
      '-NonInteractive',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      CLOSE_PS1_PATH,
    ]);
    child.stdout.on('data', (_chunk: Buffer) => { /* consumed — not needed */ });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

/**
 * Fetch messages by spawning the PowerShell script.
 * Auto-launches Outlook if it is not already running, waiting up to 30s
 * for COM to become accessible before proceeding.
 * Returns an array of raw message objects.
 * Never throws — returns [] on any failure.
 */
export async function fetchOutlookMessages(limit = 50): Promise<RawOutlookMessage[]> {
  const { ready } = await ensureOutlookRunning();
  if (!ready) {
    console.warn('[outlook.service] Outlook not accessible, skipping fetch');
    return [];
  }

  const result = await runPs1(limit);
  if (result.error) {
    console.warn('[outlook.service] fetch failed', { error: result.error });
    return [];
  }
  return result.messages;
}

/**
 * Check if Outlook is accessible (running + COM available).
 * Returns status object compatible with GET /api/outlook/status.
 * Does NOT auto-launch — reports current state only.
 * Auto-launch happens in fetchOutlookMessages(), called by the sync job.
 */
export async function getOutlookStatus(): Promise<{
  connected: boolean;
  email: string | null;
  last_sync: string | null;
}> {
  const lastSync = settingsModel.get('last_outlook_sync_at') ?? null;

  // Probe with Limit=0 — fast, just tests if COM object is reachable.
  const result = await runPs1(0);
  const connected = result.error === null;

  return {
    connected,
    // COM doesn't easily surface the signed-in email — null for now.
    email: null,
    last_sync: lastSync,
  };
}
