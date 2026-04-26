// ---------------------------------------------------------------------------
// Subagent / personal-subscription delegation types
// ---------------------------------------------------------------------------

export interface DelegateRequest {
  task: string;
  model?: string;
  max_tokens?: number;
  system?: string;
  tools?: unknown[];
}

export type DelegateResultOk = {
  ok: true;
  content: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
  request_id?: string;
};

export type DelegateResultErr = {
  ok: false;
  error: string;
};

export type DelegateResult = DelegateResultOk | DelegateResultErr;

// ---------------------------------------------------------------------------
// Usage periods & aggregates
// ---------------------------------------------------------------------------

export type UsagePeriod = 'session' | 'today' | 'week' | 'all';

export interface UsageAggregate {
  period: UsagePeriod;
  session_start?: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

// ---------------------------------------------------------------------------
// Recent usage events
// ---------------------------------------------------------------------------

export type UsageEventSource = 'chat' | 'delegate' | 'report' | 'ingest' | 'other';

export interface UsageEvent {
  id: number;
  occurred_at: string;
  source: UsageEventSource;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  task_summary: string | null;
  error: string | null;
}
