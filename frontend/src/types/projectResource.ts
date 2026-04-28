export interface ProjectResource {
  id: number;
  project_id: number;
  organization_id: number;
  name: string;
  role: string | null;
  team: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectResourceCreate {
  name: string;
  role?: string | null;
  team?: string | null;
  notes?: string | null;
}
