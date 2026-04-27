import { describe, it, expect } from 'vitest';
import { pricePerMillion, computeCostMicros, microsToUsd } from './anthropicPricing.js';

describe('pricePerMillion', () => {
  it('returns the table entry for a known exact model', () => {
    const p = pricePerMillion('claude-sonnet-4-6');
    expect(p.input).toBe(3);
    expect(p.output).toBe(15);
  });

  it('returns the Opus tier for opus', () => {
    const p = pricePerMillion('claude-opus-4-7');
    expect(p.input).toBe(15);
    expect(p.output).toBe(75);
  });

  it('returns the Haiku tier for haiku', () => {
    const p = pricePerMillion('claude-haiku-4-5');
    expect(p.input).toBe(0.8);
    expect(p.output).toBe(4);
  });

  it('matches by family prefix when an exact match is missing', () => {
    // Hypothetical dated revision of an existing family.
    const p = pricePerMillion('claude-sonnet-4-6-20260601');
    expect(p.input).toBe(3);
  });

  it('falls back to Sonnet tier for an unknown model', () => {
    const p = pricePerMillion('claude-something-totally-new');
    // Sonnet-ish defaults
    expect(p.input).toBeGreaterThan(0);
    expect(p.output).toBeGreaterThan(p.input);
  });
});

describe('computeCostMicros', () => {
  it('returns 0 when no tokens were used', () => {
    expect(computeCostMicros('claude-sonnet-4-6', 0, 0)).toBe(0);
  });

  it('computes input-only cost correctly', () => {
    // 1M input tokens at $3/M = $3 = 3_000_000 micros
    expect(computeCostMicros('claude-sonnet-4-6', 1_000_000, 0)).toBe(3_000_000);
  });

  it('computes output-only cost correctly', () => {
    // 1M output tokens at $15/M = $15 = 15_000_000 micros
    expect(computeCostMicros('claude-sonnet-4-6', 0, 1_000_000)).toBe(15_000_000);
  });

  it('sums input + output correctly', () => {
    // 1k input ($0.003) + 500 output ($0.0075) = $0.0105 = 10_500 micros
    expect(computeCostMicros('claude-sonnet-4-6', 1_000, 500)).toBe(10_500);
  });

  it('includes cache read + creation costs', () => {
    // 1M cache-read at $0.30/M = 300_000 micros
    // 1M cache-create at $3.75/M = 3_750_000 micros
    // Total: 4_050_000 micros
    const cost = computeCostMicros('claude-sonnet-4-6', 0, 0, 1_000_000, 1_000_000);
    expect(cost).toBe(4_050_000);
  });

  it('uses Opus pricing for an opus model', () => {
    // 1M input at $15/M = 15_000_000 micros
    expect(computeCostMicros('claude-opus-4-7', 1_000_000, 0)).toBe(15_000_000);
  });
});

describe('microsToUsd', () => {
  it('converts micros to USD as a number', () => {
    expect(microsToUsd(1_000_000)).toBe(1);
    expect(microsToUsd(500_000)).toBe(0.5);
    expect(microsToUsd(0)).toBe(0);
  });

  it('preserves precision for sub-cent costs', () => {
    expect(microsToUsd(4_200)).toBeCloseTo(0.0042, 6);
  });
});
