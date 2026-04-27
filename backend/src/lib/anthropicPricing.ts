/**
 * anthropicPricing.ts
 *
 * Per-model price table (USD per million tokens) and a `computeCostMicros()`
 * helper that converts a usage block into integer micro-USD for storage in
 * the `anthropic_usage_events` table.
 *
 * Public Anthropic pricing as of 2026-04. Update when Anthropic changes prices;
 * historical rows in the DB keep their original computed cost on purpose.
 *
 * If a model isn't in the table we fall back to the Sonnet price tier and
 * log a warning — better than crashing or under-counting.
 */

export interface ModelPrice {
  /** Price per 1M input tokens (uncached). */
  input: number;
  /** Price per 1M output tokens. */
  output: number;
  /** Price per 1M tokens read from prompt cache. Defaults to 0.1 × input. */
  cacheRead: number;
  /** Price per 1M tokens written into prompt cache. Defaults to 1.25 × input. */
  cacheCreation: number;
}

const PRICES: Record<string, ModelPrice> = {
  // Claude 4.x family (current generation)
  'claude-opus-4-7':     { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheCreation: 18.75 },
  'claude-sonnet-4-6':   { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheCreation:  3.75 },
  'claude-haiku-4-5':    { input:  0.80, output:  4.00, cacheRead: 0.08,  cacheCreation:  1.00 },
  // Claude 3.5 (legacy but still callable)
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheCreation: 3.75 },
  'claude-3-5-haiku-20241022':  { input: 0.80, output:  4.00, cacheRead: 0.08, cacheCreation: 1.00 },
};

// Sonnet entry is hard-coded above; safe to assume it exists.
const SONNET_FALLBACK = PRICES['claude-sonnet-4-6'];
if (!SONNET_FALLBACK) {
  throw new Error('anthropicPricing: missing Sonnet entry in PRICES table');
}
const FALLBACK: ModelPrice = SONNET_FALLBACK;

/**
 * Resolve a model identifier to its price tier. Anthropic uses both short
 * aliases (`claude-sonnet-4-6`) and dated versions (`claude-3-5-sonnet-20241022`);
 * we normalize by exact match first, then by family prefix.
 */
export function pricePerMillion(model: string): ModelPrice {
  const direct = PRICES[model];
  if (direct) return direct;

  // Family-prefix fallback — e.g. 'claude-sonnet-4-6-20260101' → claude-sonnet-4-6
  for (const [key, price] of Object.entries(PRICES)) {
    if (model.startsWith(key)) return price;
  }

  // Last resort — log once per process to avoid log spam.
  if (!warnedModels.has(model)) {
    warnedModels.add(model);
    console.warn(
      `[anthropicPricing] Unknown model "${model}", falling back to Sonnet tier. ` +
      `Update lib/anthropicPricing.ts when this lands in production usage.`,
    );
  }
  return FALLBACK;
}

const warnedModels = new Set<string>();

/**
 * Compute the integer micro-USD cost of a single API call given the usage
 * block from the SDK response.
 *
 * Math: tokens × (priceUSDPerMillion / 1_000_000) × 1_000_000_micros_per_USD
 *     = tokens × priceUSDPerMillion (no division, no float drift)
 */
export function computeCostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadInputTokens: number = 0,
  cacheCreationInputTokens: number = 0,
): number {
  const p = pricePerMillion(model);
  // Integer arithmetic with rounding at the end.
  const totalUsdScaledByMillion =
    inputTokens          * p.input         +
    outputTokens         * p.output        +
    cacheReadInputTokens * p.cacheRead     +
    cacheCreationInputTokens * p.cacheCreation;
  // totalUsdScaledByMillion has units (USD × 1_000_000) — that's already micro-USD.
  return Math.round(totalUsdScaledByMillion);
}

/**
 * Convert micro-USD back to a USD number for display.
 * 1_000_000 micros == $1.00
 */
export function microsToUsd(micros: number): number {
  return micros / 1_000_000;
}
