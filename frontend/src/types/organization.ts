export type OrgType = 'customer' | 'oem';

export type MetadataValue = string | number | boolean | null;
export type Metadata = Record<string, MetadataValue>;

export interface Organization {
  id: number;
  type: OrgType;
  name: string;
  metadata: Metadata | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCreate {
  type: OrgType;
  name: string;
  metadata?: Metadata | null;
}

export interface OrganizationUpdate {
  name?: string;
  metadata?: Metadata | null;
}

/** Shape returned by GET /api/organizations/recent — org with last-touched timestamp. */
export interface OrgWithLastTouched {
  id: number;
  name: string;
  type: OrgType;
  /** ISO date string of last note or agent thread message; '1970-01-01' when no activity. */
  last_touched: string;
}
