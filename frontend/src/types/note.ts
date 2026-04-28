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
  project_id?: number | null;
  capture_source?: string | null;
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
  confirmed?: boolean;
  thread_id?: number | null;
  provenance?: NoteProvenance | null;
}

/** Shape returned by GET /api/notes/unconfirmed — Note joined with org fields */
export interface NoteCapture {
  organization_id: number;
  project_id?: number | null;
  content: string;
  capture_source?: string | null;
}

export interface NoteCaptureResponse {
  note: Note;
  markdown_path: string;
}

export type NoteProposalType =
  | 'customer_ask'
  | 'task_follow_up'
  | 'project_update'
  | 'risk_blocker'
  | 'oem_mention'
  | 'customer_insight'
  | 'internal_resource';

export type NoteProposalStatus = 'pending' | 'approved' | 'denied' | 'discussing';

export interface NoteProposal {
  id: number;
  source_note_id: number;
  organization_id: number;
  project_id: number | null;
  type: NoteProposalType;
  title: string;
  summary: string;
  evidence_quote: string;
  proposed_payload: Record<string, unknown>;
  confidence: number;
  status: NoteProposalStatus;
  discussion: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteWithOrg extends Note {
  org_name: string;
  org_type: string;
}
