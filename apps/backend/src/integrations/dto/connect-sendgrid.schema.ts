import { z } from 'zod';

export const ConnectSendGridSchema = z.object({
  apiKey: z.string().min(1, 'apiKey is required'),
});

export type ConnectSendGridInput = z.infer<typeof ConnectSendGridSchema>;
