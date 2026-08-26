import { z } from 'zod';

export const ListOrdersSchema = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  status: z
    .enum([
      'RECEIVED',
      'VALIDATING',
      'VALIDATED',
      'VALIDATION_FAILED',
      'INVENTORY_CHECKED',
      'SHIPMENT_CREATED',
      'FULFILLED',
      'NOTIFIED',
      'COMPLETED',
      'FAILED',
      'CANCELED',
    ])
    .optional(),
  search: z.string().trim().min(1).optional(),
});

export type ListOrdersInput = z.infer<typeof ListOrdersSchema>;
