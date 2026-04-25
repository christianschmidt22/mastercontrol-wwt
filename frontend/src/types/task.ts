export type TaskStatus = 'open' | 'done' | 'snoozed';

export interface Task {
  id: number;
  organization_id: number | null;
  contact_id: number | null;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

export interface TaskCreate {
  title: string;
  organization_id?: number | null;
  contact_id?: number | null;
  due_date?: string | null;
  status?: TaskStatus;
}

export interface TaskUpdate {
  title?: string;
  organization_id?: number | null;
  contact_id?: number | null;
  due_date?: string | null;
  status?: TaskStatus;
}
