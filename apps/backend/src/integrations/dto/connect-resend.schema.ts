import { z } from 'zod';

export const ConnectResendSchema = z.object({
  apiKey: z.string().min(1, 'apiKey is required'),
});

export type ConnectResendInput = z.infer<typeof ConnectResendSchema>;
