import { z } from 'zod';

export const CaptureAttachmentSchema = z.object({
  name: z.string().min(1).max(180),
  mime_type: z.string().min(1).max(120),
  data_base64: z
    .string()
    .min(1)
    .max(11_500_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

export const CaptureActionRunSchema = z.object({
  prompt: z.string().min(1).max(4_000),
  organization_id: z.number().int().positive().optional().nullable(),
  attachments: z.array(CaptureAttachmentSchema).min(1).max(3),
});

export type CaptureActionRunInput = z.infer<typeof CaptureActionRunSchema>;
