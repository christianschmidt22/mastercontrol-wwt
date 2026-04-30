/**
 * Outlook integration TypeScript interfaces.
 * These mirror the wire shapes returned by /api/outlook/*.
 *
 * Auth types removed (DeviceCodeResponse, AuthPollResponse): the integration
 * now reads from the local Outlook desktop app via COM — no OAuth required.
 */

export interface OutlookMessage {
  id: number;
  internet_message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[];
  cc_emails: string[];
  sent_at: string | null;
  has_attachments: boolean;
  body_preview: string | null;
  body_cached: string | null;
  synced_at: string;
}

export interface OutlookMessageOrg {
  id: number;
  message_id: number;
  org_id: number;
  source: string;
  confidence: number;
}

export interface OutlookStatus {
  connected: boolean;
  email: string | null;
  last_sync: string | null;
}
