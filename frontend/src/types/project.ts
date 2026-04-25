export type ProjectStatus =
  | 'active'
  | 'qualifying'
  | 'won'
  | 'lost'
  | 'paused'
  | 'closed';

export interface Project {
  id: number;
  organization_id: number;
  name: string;
  status: ProjectStatus;
  description: string | null;
  doc_url: string | null;
  notes_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  organization_id: number;
  name: string;
  status?: ProjectStatus;
  description?: string | null;
  doc_url?: string | null;
  notes_url?: string | null;
}

export interface ProjectUpdate {
  name?: string;
  status?: ProjectStatus;
  description?: string | null;
  doc_url?: string | null;
  notes_url?: string | null;
}
