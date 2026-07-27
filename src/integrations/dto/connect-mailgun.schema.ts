import { z } from 'zod';

export const ConnectMailgunSchema = z.object({
  domain: z.string().min(1, 'domain is required'),
  apiKey: z.string().min(1, 'apiKey is required'),
});

export type ConnectMailgunInput = z.infer<typeof ConnectMailgunSchema>;
