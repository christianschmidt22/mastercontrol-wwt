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

// ---------------------------------------------------------------------------
// Agentic delegate (POST /api/subagent/delegate-agentic)
// ---------------------------------------------------------------------------

export type DelegateTool =
  | 'read_file'
  | 'list_files'
  | 'write_file'
  | 'edit_file'
  | 'bash';

export interface AgenticDelegateRequest {
  task: string;
  working_dir?: string;
  tools: DelegateTool[];
  model?: string;
  max_iterations?: number;
  max_tokens?: number;
  system?: string;
  task_summary?: string;
}

export type TranscriptEntry =
  | {
      kind: 'assistant_text';
      text: string;
      turn: number;
    }
  | {
      kind: 'assistant_tool_use';
      tool: string;
      input: unknown;
      tool_use_id: string;
      turn: number;
    }
  | {
      kind: 'tool_result';
      tool_use_id: string;
      output: string;
      is_error: boolean;
      turn: number;
    };

export interface AgenticTokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface AgenticResultOk {
  ok: true;
  transcript: TranscriptEntry[];
  total_usage: AgenticTokenUsage;
  total_cost_usd: number;
  iterations: number;
  stopped_reason: 'end_turn' | 'max_iterations';
}

export interface AgenticResultErr {
  ok: false;
  error: string;
  transcript_so_far: TranscriptEntry[];
  total_usage: AgenticTokenUsage;
}

export type AgenticResult = AgenticResultOk | AgenticResultErr;
