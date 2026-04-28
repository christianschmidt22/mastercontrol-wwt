import { z } from 'zod';

export const TaskStatusSchema = z.enum(['open', 'done', 'snoozed']);

export const TaskSchema = z.object({
  id: z.number().int(),
  organization_id: z.number().int().nullable(),
  contact_id: z.number().int().nullable(),
  project_id: z.number().int().nullable(),
  title: z.string(),
  due_date: z.string().nullable(),
  status: TaskStatusSchema,
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

export const TaskCreateSchema = z.object({
  title: z.string().min(1),
  organization_id: z.number().int().optional().nullable(),
  contact_id: z.number().int().optional().nullable(),
  project_id: z.number().int().optional().nullable(),
  due_date: z.string().optional().nullable(),
  status: TaskStatusSchema.optional(),
});

export const TaskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  organization_id: z.number().int().optional().nullable(),
  contact_id: z.number().int().optional().nullable(),
  project_id: z.number().int().optional().nullable(),
  due_date: z.string().optional().nullable(),
  status: TaskStatusSchema.optional(),
});

/** GET /tasks?status=&due_before=&org_id=&project_id= query */
export const TaskListQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  due_before: z.string().optional(),
  org_id: z.coerce.number().int().positive().optional(),
  project_id: z.coerce.number().int().positive().optional(),
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskCreate = z.infer<typeof TaskCreateSchema>;
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;
