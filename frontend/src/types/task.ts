export type TaskStatus = 'open' | 'done' | 'snoozed';
export type TaskKind = 'task' | 'question';

export interface Task {
  id: number;
  organization_id: number | null;
  contact_id: number | null;
  project_id: number | null;
  title: string;
  details: string | null;
  kind: TaskKind;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

export interface TaskCreate {
  title: string;
  organization_id?: number | null;
  contact_id?: number | null;
  project_id?: number | null;
  details?: string | null;
  kind?: TaskKind;
  due_date?: string | null;
  status?: TaskStatus;
}

export interface TaskUpdate {
  title?: string;
  organization_id?: number | null;
  contact_id?: number | null;
  project_id?: number | null;
  details?: string | null;
  kind?: TaskKind;
  due_date?: string | null;
  status?: TaskStatus;
}
