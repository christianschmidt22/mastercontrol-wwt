-- 008_savings_tracking.sql
--
-- Adds `would_have_cost_micros` to anthropic_usage_events so the AgentsPage
-- tile can show a "Saved" counter for runs that went through the
-- subscription path instead of the metered API.
--
-- Semantics:
--   - For API-key delegations (source='delegate' via /delegate or
--     /delegate-agentic, plus chat/report/ingest): would_have_cost_micros
--     equals cost_usd_micros — the call was actually billed at the metered
--     rate, so "what it would have cost" is the same as what it did cost.
--   - For subscription delegations (source='delegate' via /delegate-sdk):
--     would_have_cost_micros is the SDK-reported total_cost_usd × 1_000_000,
--     while cost_usd_micros stays 0 (subscription quota covers it).
--
-- Savings formula (in aggregator): SUM(would_have_cost_micros - cost_usd_micros).
-- Existing rows get 0 by the DEFAULT — they predate the savings tracking
-- and we don't try to retroactively reconstruct what would-have-cost.

ALTER TABLE anthropic_usage_events
  ADD COLUMN would_have_cost_micros INTEGER NOT NULL DEFAULT 0;
