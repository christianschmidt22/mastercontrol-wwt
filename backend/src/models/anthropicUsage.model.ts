/**
 * anthropicUsage.model.ts
 *
 * SQLite layer for the `anthropic_usage_events` table (migration 007).
 * Records every Anthropic API call so the Agents page tile can show
 * session/today/week/all-time aggregates.
 *
 * Cost is stored in micro-USD (integer) — see lib/anthropicPricing.ts.
 */
import { db } from '../db/database.js';
import { microsToUsd } from '../lib/anthropicPricing.js';

export type UsageSource = 'chat' | 'delegate' | 'report' | 'ingest' | 'other';
export type UsagePeriod = 'session' | 'today' | 'week' | 'all';

export interface UsageEvent {
  id: number;
  occurred_at: string;
  source: UsageSource;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd_micros: number;
  cost_usd: number;
  /**
   * Metered-API equivalent cost (USD micros). Equals cost_usd_micros for
   * API-key calls; for subscription delegations this is the SDK-reported
   * total_cost_usd while cost_usd_micros stays 0. The diff is "savings".
   */
  would_have_cost_micros: number;
  would_have_cost_usd: number;
  request_id: string | null;
  task_summary: string | null;
  error: string | null;
}

export interface UsageEventInput {
  source: UsageSource;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cost_usd_micros: number;
  /**
   * What this call would have cost via the metered API. If omitted,
   * defaults to `cost_usd_micros` (the API-key path billing == what it
   * would have cost via the API). Subscription paths should set this
   * explicitly to the SDK-reported total_cost_usd × 1_000_000.
   */
  would_have_cost_micros?: number;
  request_id?: string | null;
  task_summary?: string | null;
  error?: string | null;
}

export interface UsageAggregate {
  period: UsagePeriod;
  /** ISO timestamp the period starts from (or null for 'all'). */
  period_start: string | null;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  total_tokens: number;
  cost_usd_micros: number;
  cost_usd: number;
  /** SUM(would_have_cost_micros) — what every call would have cost via metered API. */
  would_have_cost_micros: number;
  would_have_cost_usd: number;
  /** SUM(would_have_cost_micros - cost_usd_micros) — money kept off the API by using subscription. */
  savings_usd_micros: number;
  savings_usd: number;
}

interface UsageRow {
  id: number;
  occurred_at: string;
  source: UsageSource;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd_micros: number;
  would_have_cost_micros: number;
  request_id: string | null;
  task_summary: string | null;
  error: string | null;
}

interface AggregateRow {
  requests: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cost_usd_micros: number | null;
  would_have_cost_micros: number | null;
}

// We pass occurred_at explicitly as ISO-8601 (with the 'T' and 'Z') so the
// stored value is directly comparable to client ISO strings. SQLite's default
// CURRENT_TIMESTAMP uses 'YYYY-MM-DD HH:MM:SS' (no T, no Z) which doesn't
// compare correctly against the ISO timestamps the service layer passes for
// the session/today/week boundaries.
const insertStmt = db.prepare<
  [
    string, UsageSource, string, number, number, number, number, number, number,
    string | null, string | null, string | null,
  ]
>(
  `INSERT INTO anthropic_usage_events (
     occurred_at, source, model, input_tokens, output_tokens,
     cache_read_input_tokens, cache_creation_input_tokens, cost_usd_micros,
     would_have_cost_micros,
     request_id, task_summary, error
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const getByIdStmt = db.prepare<[number], UsageRow>(
  `SELECT * FROM anthropic_usage_events WHERE id = ?`,
);

// Order by id DESC as a tiebreaker so two rows inserted in the same
// millisecond still come back in insert order (id is monotonic per
// SQLite AUTOINCREMENT).
const recentStmt = db.prepare<[number], UsageRow>(
  `SELECT * FROM anthropic_usage_events
   ORDER BY occurred_at DESC, id DESC
   LIMIT ?`,
);

const aggregateAllStmt = db.prepare<[], AggregateRow>(
  `SELECT
     COUNT(*)                              AS requests,
     SUM(input_tokens)                     AS input_tokens,
     SUM(output_tokens)                    AS output_tokens,
     SUM(cache_read_input_tokens)          AS cache_read_input_tokens,
     SUM(cache_creation_input_tokens)      AS cache_creation_input_tokens,
     SUM(cost_usd_micros)                  AS cost_usd_micros,
     SUM(would_have_cost_micros)           AS would_have_cost_micros
   FROM anthropic_usage_events`,
);

const aggregateSinceStmt = db.prepare<[string], AggregateRow>(
  `SELECT
     COUNT(*)                              AS requests,
     SUM(input_tokens)                     AS input_tokens,
     SUM(output_tokens)                    AS output_tokens,
     SUM(cache_read_input_tokens)          AS cache_read_input_tokens,
     SUM(cache_creation_input_tokens)      AS cache_creation_input_tokens,
     SUM(cost_usd_micros)                  AS cost_usd_micros,
     SUM(would_have_cost_micros)           AS would_have_cost_micros
   FROM anthropic_usage_events
   WHERE occurred_at >= ?`,
);

function hydrate(row: UsageRow): UsageEvent {
  return {
    ...row,
    cost_usd: microsToUsd(row.cost_usd_micros),
    would_have_cost_usd: microsToUsd(row.would_have_cost_micros),
  };
}

function hydrateAggregate(
  row: AggregateRow,
  period: UsagePeriod,
  periodStart: string | null,
): UsageAggregate {
  const input = row.input_tokens ?? 0;
  const output = row.output_tokens ?? 0;
  const cacheRead = row.cache_read_input_tokens ?? 0;
  const cacheCreation = row.cache_creation_input_tokens ?? 0;
  const micros = row.cost_usd_micros ?? 0;
  const wouldHave = row.would_have_cost_micros ?? 0;
  // Savings is what the metered API would have charged minus what we
  // actually got billed. Subscription rows contribute their full
  // would-have-cost; API-key rows contribute 0 (would_have == cost).
  // Floor at 0 in case of any data oddity (e.g. partial backfill).
  const savings = Math.max(0, wouldHave - micros);
  return {
    period,
    period_start: periodStart,
    requests: row.requests,
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheCreation,
    total_tokens: input + output + cacheRead + cacheCreation,
    cost_usd_micros: micros,
    cost_usd: microsToUsd(micros),
    would_have_cost_micros: wouldHave,
    would_have_cost_usd: microsToUsd(wouldHave),
    savings_usd_micros: savings,
    savings_usd: microsToUsd(savings),
  };
}

/**
 * Compute the ISO start boundary for a given period, given the
 * process-startup ISO for the 'session' window.
 */
function periodStartIso(period: UsagePeriod, sessionStart: string): string | null {
  if (period === 'all') return null;
  if (period === 'session') return sessionStart;
  const now = new Date();
  if (period === 'today') {
    // Midnight in local time, expressed as UTC ISO.
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return midnight.toISOString();
  }
  // 'week' = 7 days ago from now.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return sevenDaysAgo.toISOString();
}

export const anthropicUsageModel = {
  /** Persist a single usage event. Returns the inserted row, hydrated. */
  record(input: UsageEventInput): UsageEvent {
    const occurredAt = new Date().toISOString();
    // Default would_have_cost to actual cost — this gives "savings = 0"
    // for the API-key path automatically, so callers only need to set
    // would_have_cost_micros explicitly on subscription paths.
    const wouldHave = input.would_have_cost_micros ?? input.cost_usd_micros;
    const result = insertStmt.run(
      occurredAt,
      input.source,
      input.model,
      input.input_tokens,
      input.output_tokens,
      input.cache_read_input_tokens ?? 0,
      input.cache_creation_input_tokens ?? 0,
      input.cost_usd_micros,
      wouldHave,
      input.request_id ?? null,
      input.task_summary ?? null,
      input.error ?? null,
    );
    const row = getByIdStmt.get(Number(result.lastInsertRowid));
    if (!row) throw new Error('anthropicUsageModel.record: insert returned no row');
    return hydrate(row);
  },

  /** Most-recent N rows for the activity feed. Default 20, max 100. */
  recent(limit: number = 20): UsageEvent[] {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
    return recentStmt.all(safeLimit).map(hydrate);
  },

  /**
   * Sum tokens + cost across rows in a given period. The 'session' period
   * starts at the process-launch time (passed by the service layer so the
   * model stays pure).
   */
  aggregate(period: UsagePeriod, sessionStart: string): UsageAggregate {
    const start = periodStartIso(period, sessionStart);
    const row =
      start === null
        ? aggregateAllStmt.get()
        : aggregateSinceStmt.get(start);
    // SQLite returns 0 for COUNT(*) on an empty table but null for SUM(...) —
    // hydrateAggregate normalizes nulls to 0.
    const safeRow: AggregateRow = row ?? {
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      cost_usd_micros: 0,
      would_have_cost_micros: 0,
    };
    return hydrateAggregate(safeRow, period, start);
  },
};
