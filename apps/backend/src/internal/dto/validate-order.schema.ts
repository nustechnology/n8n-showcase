import { z } from 'zod';

export const ValidateOrderSchema = z.object({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
});

export type ValidateOrderInput = z.infer<typeof ValidateOrderSchema>;
