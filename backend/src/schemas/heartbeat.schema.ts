import { z } from 'zod';

const TimeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM in 24-hour time');

export const HeartbeatIntervalMinutesSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(20),
  z.literal(30),
  z.literal(60),
]);

export const HeartbeatWindowSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  not_before: TimeOfDaySchema,
  last_run_date: z.string().nullable().optional(),
  last_run_at: z.string().nullable().optional(),
  last_started_at: z.string().nullable().optional(),
  last_error: z.string().nullable().optional(),
});

export const HeartbeatJobSchema = z.object({
  id: z.literal('outlook-com-sync'),
  label: z.string().min(1).max(120),
  enabled: z.boolean(),
  deleted: z.boolean(),
  windows: z.array(HeartbeatWindowSchema).min(1).max(4),
});

export const HeartbeatConfigSchema = z.object({
  check_interval_minutes: HeartbeatIntervalMinutesSchema,
  timezone: z.literal('America/Chicago'),
  jobs: z.array(HeartbeatJobSchema).min(1).max(8),
});

export type HeartbeatConfigInput = z.infer<typeof HeartbeatConfigSchema>;
