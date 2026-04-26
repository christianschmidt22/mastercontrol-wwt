-- 007_anthropic_usage.sql
--
-- Records every Anthropic API call the app makes so usage and cost can be
-- aggregated locally. The user wants a dashboard tile (per-session, today,
-- this week, all time) on the Agents page, and a per-error / per-task feed
-- when debugging usage spikes.
--
-- Cost is stored in micro-USD (USD * 1_000_000) so we can SUM() across rows
-- without floating-point drift; pricing table lives in code (lib/anthropicPricing.ts)
-- and is computed at write time. If pricing changes in code later, historical
-- rows keep their original cost — this matches what was actually billed.
--
-- source enum mirrors the call sites in claude.service.ts (chat), reports.service.ts
-- (report), ingest.service.ts (ingest), subagent.service.ts (delegate). 'other'
-- is a catch-all for anything outside those four.

CREATE TABLE anthropic_usage_events (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source                      TEXT     NOT NULL
                              CHECK(source IN ('chat', 'delegate', 'report', 'ingest', 'other')),
  model                       TEXT     NOT NULL,
  input_tokens                INTEGER  NOT NULL DEFAULT 0,
  output_tokens               INTEGER  NOT NULL DEFAULT 0,
  cache_read_input_tokens     INTEGER  NOT NULL DEFAULT 0,
  cache_creation_input_tokens INTEGER  NOT NULL DEFAULT 0,
  -- Cost in micro-USD (1_000_000 == $1). Keep as INTEGER to avoid float drift
  -- when summing thousands of rows.
  cost_usd_micros             INTEGER  NOT NULL DEFAULT 0,
  -- Anthropic response.id when available; null on failures or when SDK shape changed.
  request_id                  TEXT,
  -- Short user-supplied description for delegate calls. Null for instrumented
  -- chat / report / ingest calls.
  task_summary                TEXT,
  -- Error message when the call failed; null on success.
  error                       TEXT
);

CREATE INDEX idx_usage_occurred_at ON anthropic_usage_events(occurred_at DESC);
CREATE INDEX idx_usage_source      ON anthropic_usage_events(source);
