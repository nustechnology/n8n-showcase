import { z } from 'zod';

export const ListAuditLogSchema = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

export type ListAuditLogInput = z.infer<typeof ListAuditLogSchema>;
