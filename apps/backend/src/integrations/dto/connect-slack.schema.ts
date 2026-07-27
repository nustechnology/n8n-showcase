import { z } from 'zod';

export const ConnectSlackSchema = z.object({
  webhookUrl: z
    .string()
    .url()
    .regex(/^https:\/\/hooks\.slack\.com\//, 'webhookUrl must be a Slack incoming-webhook URL'),
});

export type ConnectSlackInput = z.infer<typeof ConnectSlackSchema>;
