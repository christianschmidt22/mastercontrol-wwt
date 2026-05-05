export interface FreetimeSlot {
  date: string;
  start_time: string;
  end_time: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
}

export interface FreetimeParticipant {
  email: string;
  name: string;
}

export interface FreetimeFindRequest {
  participant_emails: string[];
  include_self: boolean;
  start_date: string;
  end_date: string;
  weekdays: number[];
  work_start_minutes: number;
  work_end_minutes: number;
}

export interface FreetimeFindResponse {
  slots: FreetimeSlot[];
  participants: FreetimeParticipant[];
  unresolved: string[];
}
