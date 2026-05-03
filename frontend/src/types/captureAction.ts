export interface CaptureAttachmentInput {
  name: string;
  mime_type: string;
  data_base64: string;
}

export interface CaptureActionRequest {
  prompt: string;
  organization_id?: number | null;
  attachments: CaptureAttachmentInput[];
}

export interface CaptureActionCreatedTask {
  id: number;
  title: string;
  details: string | null;
  organization_id: number | null;
  due_date: string | null;
  status: string;
}

export interface CaptureActionCreatedNote {
  id: number;
  organization_id: number;
  content: string;
  created_at: string;
}

export interface CaptureActionResult {
  summary: string;
  created_tasks: CaptureActionCreatedTask[];
  created_notes: CaptureActionCreatedNote[];
  model_notes: string[];
}
