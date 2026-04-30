/**
 * outlook.service.ts — Outlook COM automation via PowerShell.
 *
 * Design decisions (ADR 0009):
 *   - Reads from the locally running Outlook desktop app via COM
 *     (System.Runtime.InteropServices.Marshal.GetActiveObject).
 *   - No Azure app registration, no OAuth, no tokens.
 *   - Node.js spawns powershell.exe with the outlook-fetch.ps1 script;
 *     stdout is a JSON blob parsed here.
 *   - If Outlook is not running or spawn fails, returns an empty result
 *     rather than throwing — the sync scheduler treats it as a no-op.
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

// ---------------------------------------------------------------------------
// PS1 path — resolved once at module load time (ESM import.meta.url)
// ---------------------------------------------------------------------------

const PS1_PATH = fileURLToPath(
  new URL('../scripts/outlook-fetch.ps1', import.meta.url),
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
 * Fetch messages by spawning the PowerShell script.
 * Returns an array of raw message objects.
 * Never throws — returns [] on any failure.
 */
export async function fetchOutlookMessages(limit = 50): Promise<RawOutlookMessage[]> {
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
