export type NoteRole = 'user' | 'assistant' | 'agent_insight' | 'imported';

export interface NoteProvenance {
  tool?: string;
  source_thread_id?: number;
  source_org_id?: number;
  web_citations?: string[];
}

export interface Note {
  id: number;
  organization_id: number;
  content: string;
  ai_response: string | null;
  source_path: string | null;
  file_mtime: string | null;
  role: NoteRole;
  thread_id: number | null;
  provenance: NoteProvenance | null;
  confirmed: boolean;
  created_at: string;
}

export interface NoteCreate {
  organization_id: number;
  content: string;
  role?: NoteRole;
  thread_id?: number | null;
  provenance?: NoteProvenance | null;
}
