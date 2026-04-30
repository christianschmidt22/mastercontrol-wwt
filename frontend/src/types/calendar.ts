export interface CalendarEvent {
  uid: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  meeting_url: string | null;
  organizer: string | null;
  attendee_count: number;
  is_all_day: number;
  synced_at: string;
}

export interface CalendarTodayResponse {
  date: string;
  events: CalendarEvent[];
  hidden_events: CalendarEvent[];
  last_sync: string | null;
}

export interface SystemAlert {
  id: number;
  severity: 'error' | 'warn' | 'info';
  source: string;
  message: string;
  detail: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AlertsResponse {
  alerts: SystemAlert[];
  unread_count: number;
  active_count?: number;
}
