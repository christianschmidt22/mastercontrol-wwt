export interface DealReg {
  id: number;
  vendor: string;
  customer: string;
  deal_reg_number: string;
  project: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DealRegInput {
  vendor?: string | null;
  customer?: string | null;
  deal_reg_number?: string | null;
  project?: string | null;
  notes?: string | null;
}
