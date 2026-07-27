import { z } from 'zod';

// A human clicking a button, not the internal n8n-only status write
// (see src/internal/dto/update-order-status.schema.ts) — restricted to the
// terminal/manual-intervention statuses, not the automated pipeline's own
// internal transitional states (e.g. VALIDATING).
export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['FULFILLED', 'NOTIFIED', 'COMPLETED', 'CANCELED']),
  reason: z.string().optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
