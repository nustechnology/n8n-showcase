import { z } from 'zod';

export const CreateOrderEventSchema = z.object({
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type CreateOrderEventInput = z.infer<typeof CreateOrderEventSchema>;
