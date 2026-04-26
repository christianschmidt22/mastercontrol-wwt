import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/database.js';
import { anthropicUsageModel } from './anthropicUsage.model.js';

beforeEach(() => {
  db.exec('DELETE FROM anthropic_usage_events');
});

describe('anthropicUsageModel.record', () => {
  it('inserts a row and returns it hydrated with cost_usd', () => {
    const ev = anthropicUsageModel.record({
      source: 'delegate',
      model: 'claude-sonnet-4-6',
      input_tokens: 100,
      output_tokens: 50,
      cost_usd_micros: 1_050,
      task_summary: 'test task',
    });
    expect(ev.id).toBeGreaterThan(0);
    expect(ev.source).toBe('delegate');
    expect(ev.cost_usd_micros).toBe(1_050);
    expect(ev.cost_usd).toBeCloseTo(0.00105, 6);
    expect(ev.task_summary).toBe('test task');
    expect(ev.error).toBeNull();
  });

  it('accepts default 0 for cache token fields', () => {
    const ev = anthropicUsageModel.record({
      source: 'chat',
      model: 'claude-sonnet-4-6',
      input_tokens: 1,
      output_tokens: 1,
      cost_usd_micros: 18,
    });
    expect(ev.cache_read_input_tokens).toBe(0);
    expect(ev.cache_creation_input_tokens).toBe(0);
  });

  it('persists error messages on failed calls', () => {
    const ev = anthropicUsageModel.record({
      source: 'delegate',
      model: 'claude-sonnet-4-6',
      input_tokens: 0,
      output_tokens: 0,
      cost_usd_micros: 0,
      error: 'rate limited',
    });
    expect(ev.error).toBe('rate limited');
  });
});

describe('anthropicUsageModel.recent', () => {
  it('returns rows in most-recent-first order', () => {
    anthropicUsageModel.record({ source: 'chat',     model: 'claude-sonnet-4-6', input_tokens: 1, output_tokens: 1, cost_usd_micros: 18 });
    anthropicUsageModel.record({ source: 'delegate', model: 'claude-sonnet-4-6', input_tokens: 2, output_tokens: 2, cost_usd_micros: 36 });
    anthropicUsageModel.record({ source: 'report',   model: 'claude-sonnet-4-6', input_tokens: 3, output_tokens: 3, cost_usd_micros: 54 });
    const recent = anthropicUsageModel.recent(2);
    expect(recent).toHaveLength(2);
    // Last inserted appears first
    expect(recent[0]?.source).toBe('report');
    expect(recent[1]?.source).toBe('delegate');
  });

  it('clamps limit to [1, 100]', () => {
    for (let i = 0; i < 5; i++) {
      anthropicUsageModel.record({ source: 'chat', model: 'claude-sonnet-4-6', input_tokens: 1, output_tokens: 1, cost_usd_micros: 18 });
    }
    expect(anthropicUsageModel.recent(0)).toHaveLength(1);
    expect(anthropicUsageModel.recent(1000)).toHaveLength(5);
  });
});

describe('anthropicUsageModel.aggregate', () => {
  const sessionStart = new Date(Date.now() - 1000).toISOString(); // 1s ago

  it('returns all-zero aggregate when there are no rows', () => {
    const agg = anthropicUsageModel.aggregate('all', sessionStart);
    expect(agg.requests).toBe(0);
    expect(agg.input_tokens).toBe(0);
    expect(agg.output_tokens).toBe(0);
    expect(agg.cost_usd_micros).toBe(0);
    expect(agg.cost_usd).toBe(0);
  });

  it('sums tokens and cost across rows for "all"', () => {
    anthropicUsageModel.record({ source: 'chat',     model: 'claude-sonnet-4-6', input_tokens: 100, output_tokens: 50,  cost_usd_micros: 1_050 });
    anthropicUsageModel.record({ source: 'delegate', model: 'claude-sonnet-4-6', input_tokens: 200, output_tokens: 100, cost_usd_micros: 2_100 });
    const agg = anthropicUsageModel.aggregate('all', sessionStart);
    expect(agg.requests).toBe(2);
    expect(agg.input_tokens).toBe(300);
    expect(agg.output_tokens).toBe(150);
    expect(agg.total_tokens).toBe(450);
    expect(agg.cost_usd_micros).toBe(3_150);
    expect(agg.cost_usd).toBeCloseTo(0.00315, 6);
    expect(agg.period).toBe('all');
    expect(agg.period_start).toBeNull();
  });

  it('"session" filters to rows after the supplied session-start', () => {
    // This row will be older than the session_start we pass below.
    anthropicUsageModel.record({ source: 'chat', model: 'claude-sonnet-4-6', input_tokens: 999, output_tokens: 999, cost_usd_micros: 99_999 });
    // Bump session_start to AFTER that row was written.
    const future = new Date(Date.now() + 5_000).toISOString();
    const agg = anthropicUsageModel.aggregate('session', future);
    expect(agg.requests).toBe(0);
    expect(agg.input_tokens).toBe(0);
    expect(agg.period_start).toBe(future);
  });

  it('"today" filters at local-midnight boundary', () => {
    anthropicUsageModel.record({ source: 'chat', model: 'claude-sonnet-4-6', input_tokens: 1, output_tokens: 1, cost_usd_micros: 18 });
    const agg = anthropicUsageModel.aggregate('today', sessionStart);
    // Today's row counts.
    expect(agg.requests).toBe(1);
    expect(agg.period).toBe('today');
    expect(agg.period_start).toBeTruthy();
  });

  it('"week" uses a 7-day-ago boundary', () => {
    anthropicUsageModel.record({ source: 'chat', model: 'claude-sonnet-4-6', input_tokens: 1, output_tokens: 1, cost_usd_micros: 18 });
    const agg = anthropicUsageModel.aggregate('week', sessionStart);
    expect(agg.requests).toBe(1);
    expect(agg.period).toBe('week');
    expect(agg.period_start).toBeTruthy();
  });
});
