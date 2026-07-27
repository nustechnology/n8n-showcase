import { z } from 'zod';

export const ConnectDiscordSchema = z.object({
  webhookUrl: z
    .string()
    .url()
    .regex(/^https:\/\/discord\.com\/api\/webhooks\//, 'webhookUrl must be a Discord webhook URL'),
});

export type ConnectDiscordInput = z.infer<typeof ConnectDiscordSchema>;
