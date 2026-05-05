export interface Contact {
  id: number;
  organization_id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  role?: string | null;
  details?: string | null;
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
  details?: string | null;
  assigned_org_ids?: number[];
}

export interface ContactUpdate {
  name?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  details?: string | null;
  assigned_org_ids?: number[];
}

export interface ContactEnrichmentSuggestion {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  confidence: number;
  evidence: string[];
}

export interface ContactEnrichmentResponse {
  contact_id: number;
  suggestions: ContactEnrichmentSuggestion;
  notes: string[];
}

export interface WwtDirectoryResult {
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  office: string | null;
  phone: string | null;
  source: string | null;
}
