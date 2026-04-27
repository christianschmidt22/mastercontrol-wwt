export interface Contact {
  id: number;
  organization_id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  role?: string | null;
  created_at: string;
  assigned_org_ids: number[];
}

export interface ContactCreate {
  organization_id: number;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  assigned_org_ids?: number[];
}

export interface ContactUpdate {
  name?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  assigned_org_ids?: number[];
}
