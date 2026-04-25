import { z } from 'zod';

export const ChatRequestSchema = z.object({
  thread_id: z.number().int().optional(),
  content: z.string().min(1),
});

// SSE event payload union — each variant is one line of a text/event-stream response
export const ChatStreamChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('tool_use'),
    tool: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    tool: z.string(),
    ok: z.boolean(),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal('done'),
  }),
]);

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatStreamChunk = z.infer<typeof ChatStreamChunkSchema>;
