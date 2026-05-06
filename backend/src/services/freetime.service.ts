import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PS1_PATH = fileURLToPath(new URL('../scripts/outlook-freebusy.ps1', import.meta.url));

export interface FreetimeParticipant {
  email: string;
  name: string;
}

export interface FreetimeSlot {
  date: string;
  start_time: string;
  end_time: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
}

export interface FindFreetimeInput {
  participant_emails: string[];
  include_self: boolean;
  start_date: string;
  end_date: string;
  weekdays: number[];
  work_start_minutes: number;
  work_end_minutes: number;
  minimum_duration_minutes: number;
}

export interface FindFreetimeResult {
  slots: FreetimeSlot[];
  participants: FreetimeParticipant[];
  unresolved: string[];
}

interface Ps1FreetimeResult extends FindFreetimeResult {
  error: string | null;
}

function parseResult(stdout: string): Ps1FreetimeResult {
  const parsed = JSON.parse(stdout.trim()) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error('FreeBusy lookup returned non-object JSON.');
  const obj = parsed as Record<string, unknown>;
  const error = typeof obj['error'] === 'string' && obj['error'].trim() ? obj['error'].trim() : null;
  const slots = Array.isArray(obj['slots']) ? obj['slots'] as FreetimeSlot[] : [];
  const participants = Array.isArray(obj['participants']) ? obj['participants'] as FreetimeParticipant[] : [];
  const unresolved = Array.isArray(obj['unresolved'])
    ? obj['unresolved'].filter((item): item is string => typeof item === 'string')
    : [];
  return { error, slots, participants, unresolved };
}

export async function findFreetime(input: FindFreetimeInput): Promise<FindFreetimeResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn('powershell.exe', [
      '-NonInteractive',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      PS1_PATH,
      '-ParticipantsJson',
      JSON.stringify(input.participant_emails),
      '-StartDate',
      input.start_date,
      '-EndDate',
      input.end_date,
      '-WeekdaysJson',
      JSON.stringify(input.weekdays),
      '-WorkStartMinutes',
      String(input.work_start_minutes),
      '-WorkEndMinutes',
      String(input.work_end_minutes),
      '-IncludeSelf',
      input.include_self ? 'true' : 'false',
      '-MinimumDurationMinutes',
      String(input.minimum_duration_minutes),
    ]);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => reject(new Error(`Failed to start Outlook FreeBusy lookup: ${err.message}`)));
    child.on('close', (code) => {
      const trimmedStderr = stderr.trim();
      if (trimmedStderr) console.warn('[freetime] ps1 stderr', { message: trimmedStderr });
      if (code !== 0) {
        reject(new Error(`Outlook FreeBusy lookup exited with code ${code ?? 'unknown'}${trimmedStderr ? `: ${trimmedStderr}` : ''}.`));
        return;
      }
      try {
        const result = parseResult(stdout);
        if (result.error) {
          reject(new Error(result.error));
          return;
        }
        resolve({
          slots: result.slots,
          participants: result.participants,
          unresolved: result.unresolved,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse Outlook FreeBusy output.'));
      }
    });
  });
}
