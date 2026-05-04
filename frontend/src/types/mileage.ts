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

export interface MileageCalculateRequest {
  from_address: string;
  to_address: string;
}

export interface MileageCalculation {
  from_address: string;
  to_address: string;
  type: 'round trip';
  miles: number | null;
  one_way_miles: number | null;
  distance_source: 'cache' | 'osrm' | 'unavailable';
  distance_error: string | null;
  maps_url: string;
}

export interface MileageExportRow {
  uid: string;
  date: string;
  subject: string;
  from_address: string;
  to_address: string;
  type: 'round trip';
  miles: number | null;
}

export interface MileageExportPdfRequest {
  start_date: string;
  end_date: string;
  total_miles: number;
  rows: MileageExportRow[];
}

export interface MileageExportPdfResponse {
  file_name: string;
  file_path: string;
  row_count: number;
  total_miles: number;
}
