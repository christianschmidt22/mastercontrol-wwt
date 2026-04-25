export type AgentSection = 'customer' | 'oem';

export interface AgentConfig {
  id: number;
  section: AgentSection;
  organization_id: number | null;
  system_prompt_template: string;
  tools_enabled: Record<string, unknown>;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface AgentConfigUpdate {
  system_prompt_template?: string;
  tools_enabled?: Record<string, unknown>;
  model?: string;
}
