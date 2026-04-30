/**
 * reports.service.ts — Phase 2 / Step 5b/5c.
 *
 * Owns the runtime side of the reports module:
 *
 *   - runReport(scheduleId, fireTime): renders the report's prompt template
 *     against live DB data, asks Anthropic (non-streaming, tools=[]) to
 *     generate the markdown output, writes the file under
 *     `<cwd>/reports/<report.id>/<run.id>.md`, hashes it (sha256), and
 *     records the result on the report_runs row.
 *
 *   - seedDailyTaskReview(): idempotent seed of the Daily Task Review
 *     report + a `0 7 * * *` schedule. Called once on startup.
 *
 *   - DAILY_TASK_REVIEW_TEMPLATE: the inline prompt template used by the
 *     seed (kept here so the seed and the prompt template ship together).
 *
 * All Anthropic SDK calls go through `claude.service.ts → generateReport`.
 * No SQL lives here — every read/write is via the model layer.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getReportsRoot } from '../lib/appPaths.js';
import { getNextCronTime } from '../lib/cronUtils.js';

import { reportModel, type Report } from '../models/report.model.js';
import {
  reportScheduleModel,
  type ReportSchedule,
} from '../models/reportSchedule.model.js';
import { reportRunModel, type ReportRun } from '../models/reportRun.model.js';
import { generateReport } from './claude.service.js';
import { taskModel, type Task } from '../models/task.model.js';
import { noteModel } from '../models/note.model.js';
import { organizationModel } from '../models/organization.model.js';
import { logAlert } from '../models/systemAlert.model.js';

// ---------------------------------------------------------------------------
// DAILY_TASK_REVIEW_TEMPLATE — the seed report's prompt template (Step 5c).
//
// Variables expanded by buildPrompt():
//   {{date}}, {{tasks_due_today}}, {{tasks_due_count}},
//   {{tasks_overdue}}, {{tasks_overdue_count}},
//   {{tasks_stale}}, {{tasks_stale_count}}, {{recent_notes}}.
// ---------------------------------------------------------------------------

export const DAILY_TASK_REVIEW_TEMPLATE = `You are a personal CRM assistant for a WWT account executive. Generate a
concise daily task review for {{date}}.

**Tasks due today ({{tasks_due_count}}):**
{{tasks_due_today}}

**Overdue tasks ({{tasks_overdue_count}}):**
{{tasks_overdue}}

**Stale tasks — no activity >14 days ({{tasks_stale_count}}):**
{{tasks_stale}}

**Recent notes across all orgs (last 48 hours):**
{{recent_notes}}

Provide:
1. A 3-sentence "today at a glance" summary.
2. Suggested follow-ups or action items, ranked by urgency.
3. Any patterns or risks you notice across the stale / overdue pile.

Be direct. Use markdown. Keep the output under 600 words.
`;

// ---------------------------------------------------------------------------
// Template variable expansion
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_DAYS = 14;
const RECENT_NOTES_LIMIT = 10;

function todayIso(): string {
  // YYYY-MM-DD in local time — matches `due_date` storage which is also a
  // simple date string.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function formatTaskLine(t: Task): string {
  const orgPart =
    t.organization_id !== null
      ? ` (org #${t.organization_id})`
      : '';
  const duePart = t.due_date ? ` — due ${t.due_date}` : '';
  return `- ${t.title}${duePart}${orgPart}`;
}

function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) return '_(none)_';
  return tasks.map(formatTaskLine).join('\n');
}

interface RecentNoteRow {
  id: number;
  organization_id: number;
  content: string;
  role: string;
  created_at: string;
}

/**
 * Pull recent notes across the report's target orgs. For `["all"]` we walk
 * every org; for a specific id list we restrict the union to those orgs.
 * Notes are filtered to the last 48 hours and confirmed-only so unconfirmed
 * agent insights don't leak into the report.
 */
function recentNotesAcrossTargets(report: Report): RecentNoteRow[] {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const orgIds: number[] =
    report.target.length === 1 && report.target[0] === 'all'
      ? [
          ...organizationModel.listByType('customer').map((o) => o.id),
          ...organizationModel.listByType('oem').map((o) => o.id),
        ]
      : (report.target as number[]);

  const collected: RecentNoteRow[] = [];
  for (const orgId of orgIds) {
    const notes = noteModel.listRecent(orgId, RECENT_NOTES_LIMIT, {
      confirmedOnly: true,
    });
    for (const n of notes) {
      const t = Date.parse(n.created_at);
      if (Number.isFinite(t) && t >= cutoff) {
        collected.push({
          id: n.id,
          organization_id: n.organization_id,
          content: n.content,
          role: n.role,
          created_at: n.created_at,
        });
      }
    }
  }
  collected.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return collected.slice(0, RECENT_NOTES_LIMIT);
}

function formatNoteLines(notes: RecentNoteRow[]): string {
  if (notes.length === 0) return '_(none)_';
  return notes
    .map(
      (n) =>
        `- [${n.created_at}] org #${n.organization_id}: ${n.content
          .replace(/\s+/g, ' ')
          .slice(0, 200)}`,
    )
    .join('\n');
}

/**
 * Expand template variables in the report's prompt_template against live
 * data. Centralised so that runReport() and tests can both exercise it.
 */
export function buildPrompt(report: Report): string {
  const today = todayIso();
  const tomorrow = startOfTomorrowIso();
  const staleCutoff = isoNDaysAgo(STALE_THRESHOLD_DAYS);

  // Tasks due today: due_date in [today, tomorrow), status=open.
  const dueToday = taskModel
    .list({ status: 'open' })
    .filter((t) => t.due_date !== null && t.due_date >= today && t.due_date < tomorrow);

  // Overdue: due_date < today, status=open.
  const overdue = taskModel
    .list({ status: 'open', due_before: today });

  // Stale: open tasks created more than STALE_THRESHOLD_DAYS ago.
  // We don't have a per-task `updated_at` column in Phase 1's schema, so we
  // approximate "no activity" with `created_at` — the seed report copy
  // already calls this an approximation ("no activity >14 days").
  const stale = taskModel
    .list({ status: 'open' })
    .filter((t) => t.created_at < staleCutoff);

  const recentNotes = recentNotesAcrossTargets(report);

  return report.prompt_template
    .replaceAll('{{date}}', today)
    .replaceAll('{{tasks_due_today}}', formatTaskList(dueToday))
    .replaceAll('{{tasks_due_count}}', String(dueToday.length))
    .replaceAll('{{tasks_overdue}}', formatTaskList(overdue))
    .replaceAll('{{tasks_overdue_count}}', String(overdue.length))
    .replaceAll('{{tasks_stale}}', formatTaskList(stale))
    .replaceAll('{{tasks_stale_count}}', String(stale.length))
    .replaceAll('{{recent_notes}}', formatNoteLines(recentNotes));
}

// ---------------------------------------------------------------------------
// runReport — the workhorse (Step 5b)
// ---------------------------------------------------------------------------

export interface RunReportResult {
  /** The created (or pre-existing) run row id. */
  runId: number;
  /** Absolute path of the markdown output, or null if the run was a no-op. */
  outputPath: string | null;
  /** True when this call actually executed a fresh run. */
  executed: boolean;
}

/**
 * Render a scheduled report's prompt → ask Anthropic → write the output to
 * disk → record the result on the report_runs row.
 *
 * Idempotent on (schedule_id, fire_time): a second call with the same key
 * returns immediately (`executed: false`) thanks to UNIQUE + INSERT OR
 * IGNORE in `reportRunModel.create`. This makes the `run-now` endpoint and
 * the cron tick safe to fire concurrently.
 *
 * Throws (and marks the run failed) on Anthropic errors, on missing
 * schedule/report rows, and on filesystem failures during the write.
 */
export async function runReport(
  scheduleId: number,
  fireTime: number,
): Promise<RunReportResult> {
  // 1. Acquire (or attach to) the run row.
  const { run, created } = reportRunModel.create({
    schedule_id: scheduleId,
    fire_time: fireTime,
    status: 'queued',
  });

  if (!created) {
    // Another tick already owns this fire_time. Bail without writing.
    return {
      runId: run.id,
      outputPath: run.output_path,
      executed: false,
    };
  }

  // 2. Resolve schedule + report.
  const schedule = reportScheduleModel.get(scheduleId);
  if (!schedule) {
    reportRunModel.updateStatus(run.id, 'failed', {
      error: `schedule ${scheduleId} not found`,
    });
    // severity='error' (not 'warn'): a missing schedule row mid-run means
    // a row got deleted out from under a scheduled tick. That's a
    // data-integrity issue worth surfacing loudly via the bell, not a
    // recoverable transient like an Anthropic hiccup.
    logAlert(
      'error',
      'reportRun',
      `Scheduled report run failed (schedule #${scheduleId} not found)`,
      {
        schedule_id: scheduleId,
        fire_time: fireTime,
      },
    );
    throw new Error(`schedule ${scheduleId} not found`);
  }
  const report = reportModel.get(schedule.report_id);
  if (!report) {
    reportRunModel.updateStatus(run.id, 'failed', {
      error: `report ${schedule.report_id} not found`,
    });
    // See note above — same data-integrity rationale.
    logAlert(
      'error',
      'reportRun',
      `Scheduled report run failed (report #${schedule.report_id} not found)`,
      {
        schedule_id: scheduleId,
        report_id: schedule.report_id,
        fire_time: fireTime,
      },
    );
    throw new Error(`report ${schedule.report_id} not found`);
  }

  // 3. Mark running.
  reportRunModel.updateStatus(run.id, 'running');

  try {
    // 4. Build prompt with live data.
    const prompt = buildPrompt(report);

    // 5. Generate output via Anthropic.
    const output = await generateReport(prompt);

    // 6. Write to disk: <repo>/reports/<report.id>/<run.id>.md
    const outDir = path.join(getReportsRoot(), String(report.id));
    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${run.id}.md`);
    writeFileSync(outPath, output, 'utf8');

    // 7. Hash the output.
    const sha256 = createHash('sha256').update(output, 'utf8').digest('hex');

    // 8. Summary = first 200 chars of output.
    const summary = output.slice(0, 200);

    // 9. Persist results on the run row.
    reportRunModel.updateStatus(run.id, 'done', {
      output_path: outPath,
      output_sha256: sha256,
      summary,
    });

    // 10. Update schedule run markers for the Reports page and catch-up.
    reportScheduleModel.updateLastRun(scheduleId, fireTime);
    reportScheduleModel.updateNextRun(
      scheduleId,
      getNextCronTime(schedule.cron_expr, fireTime),
    );

    return { runId: run.id, outputPath: outPath, executed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportRunModel.updateStatus(run.id, 'failed', { error: message });

    // Surface to the bell-icon notifications. severity='warn' because the
    // schedule will retry on the next cron tick — this is recoverable noise,
    // not an outage.
    //
    // Skip the historical "API key not configured" message: pre-subscription-
    // auth runs raised it on every fire and would flood the alert feed for
    // anyone upgrading from that era. See claude.service.ts auth-mode wiring.
    if (!/API key not configured/i.test(message)) {
      const truncated = message.length > 500 ? `${message.slice(0, 500)}…` : message;
      logAlert(
        'warn',
        'reportRun',
        `Scheduled report run failed (schedule #${scheduleId})`,
        {
          schedule_id: scheduleId,
          report_id: report.id,
          fire_time: fireTime,
          error: truncated,
        },
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// seedDailyTaskReview — Step 5c
// ---------------------------------------------------------------------------

export interface SeedDailyTaskReviewResult {
  /** True when a new report row was inserted, false when one already existed. */
  created: boolean;
  report: Report;
  schedule: ReportSchedule;
}

/**
 * Idempotent seed for the Daily Task Review report + 07:00 schedule.
 *
 * Called once at startup (after `runMigrations()` in Step 1's bootstrap).
 * If a report named exactly `'Daily Task Review'` already exists, the
 * existing row + its first schedule are returned. Otherwise a new report
 * is created with the inline `DAILY_TASK_REVIEW_TEMPLATE` and a daily
 * `0 7 * * *` schedule attached.
 */
export function seedDailyTaskReview(): SeedDailyTaskReviewResult {
  const existing = reportModel
    .list()
    .find((r) => r.name === 'Daily Task Review');

  if (existing) {
    const schedules = reportScheduleModel.listByReport(existing.id);
    if (schedules.length > 0) {
      const schedule = schedules[0];
      if (schedule.next_run_at === null && schedule.enabled && existing.enabled) {
        reportScheduleModel.updateNextRun(
          schedule.id,
          getNextCronTime(schedule.cron_expr, Math.floor(Date.now() / 1000)),
        );
        return {
          created: false,
          report: existing,
          schedule: reportScheduleModel.get(schedule.id)!,
        };
      }
      return { created: false, report: existing, schedule };
    }
    // The report exists but has no schedule — adopt the schedule via upsert
    // so subsequent calls remain idempotent.
    const schedule = reportScheduleModel.upsert(existing.id, {
      cron_expr: '0 7 * * *',
      enabled: true,
      next_run_at: getNextCronTime('0 7 * * *', Math.floor(Date.now() / 1000)),
    });
    return { created: false, report: existing, schedule };
  }

  const report = reportModel.create({
    name: 'Daily Task Review',
    prompt_template: DAILY_TASK_REVIEW_TEMPLATE,
    target: ['all'],
    output_format: 'markdown',
    enabled: true,
  });
  const schedule = reportScheduleModel.upsert(report.id, {
    cron_expr: '0 7 * * *',
    enabled: true,
    next_run_at: getNextCronTime('0 7 * * *', Math.floor(Date.now() / 1000)),
  });
  return { created: true, report, schedule };
}

// ---------------------------------------------------------------------------
// Re-exports for the route layer convenience
// ---------------------------------------------------------------------------

export type { Report, ReportSchedule, ReportRun };
