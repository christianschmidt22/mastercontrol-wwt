import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PS1_PATH = fileURLToPath(new URL('../scripts/outlook-directory-search.ps1', import.meta.url));
const DIRECTORY_SEARCH_TIMEOUT_MS = 25_000;

export interface WwtDirectoryResult {
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  office: string | null;
  phone: string | null;
  source: string | null;
}

interface Ps1DirectoryResult {
  error: string | null;
  results: WwtDirectoryResult[];
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseResult(stdout: string): Ps1DirectoryResult {
  const parsed = JSON.parse(stdout.trim()) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error('Directory search returned non-object JSON.');
  const obj = parsed as Record<string, unknown>;
  const error = cleanString(obj['error']);
  const rows = Array.isArray(obj['results']) ? obj['results'] : [];
  const results = rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const value = row as Record<string, unknown>;
    const name = cleanString(value['name']);
    const email = cleanString(value['email']);
    if (!name || !email) return [];
    return [{
      name,
      email,
      title: cleanString(value['title']),
      department: cleanString(value['department']),
      office: cleanString(value['office']),
      phone: cleanString(value['phone']),
      source: cleanString(value['source']),
    }];
  });
  return { error, results };
}

export async function searchWwtDirectory(query: string, limit = 20): Promise<WwtDirectoryResult[]> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn('powershell.exe', [
      '-NonInteractive',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      PS1_PATH,
      '-Query',
      query,
      '-Limit',
      String(limit),
    ]);
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('Outlook directory search timed out. Try a more specific first and last name.'));
    }, DIRECTORY_SEARCH_TIMEOUT_MS);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => finish(() => reject(new Error(`Failed to start Outlook directory search: ${err.message}`))));
    child.on('close', (code) => {
      const trimmedStderr = stderr.trim();
      if (trimmedStderr) console.warn('[outlookDirectory] ps1 stderr', { message: trimmedStderr });
      if (code !== 0) {
        finish(() => reject(new Error(`Outlook directory search exited with code ${code ?? 'unknown'}${trimmedStderr ? `: ${trimmedStderr}` : ''}.`)));
        return;
      }
      try {
        const result = parseResult(stdout);
        if (result.error) {
          const message = result.error;
          finish(() => reject(new Error(message)));
          return;
        }
        finish(() => resolve(result.results));
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error('Failed to parse Outlook directory output.')));
      }
    });
  });
}
