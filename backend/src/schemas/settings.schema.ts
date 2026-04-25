import { z } from 'zod';

export const SettingPutSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export const SettingGetResponseSchema = z.object({
  key: z.string(),
  // value is masked (e.g. "***last4") for secret keys; plaintext for others
  value: z.string(),
});

export type SettingPut = z.infer<typeof SettingPutSchema>;
export type SettingGetResponse = z.infer<typeof SettingGetResponseSchema>;
