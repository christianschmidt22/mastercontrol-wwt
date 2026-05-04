export interface MileageReportRow {
  uid: string;
  date: string;
  subject: string;
  from_address: string;
  to_address: string;
  type: 'round trip';
  miles: number | null;
  one_way_miles: number | null;
  distance_source: 'cache' | 'osrm' | 'unavailable' | 'not_calculated';
  distance_error: string | null;
  maps_url: string;
  start_at: string;
}

export interface MileageReport {
  start_date: string;
  end_date: string;
  from_address: string;
  rows: MileageReportRow[];
  total_miles: number;
  excluded_count: number;
  calculated: boolean;
}
