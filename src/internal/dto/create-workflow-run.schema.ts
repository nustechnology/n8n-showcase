import { z } from 'zod';

export const CreateWorkflowRunSchema = z.object({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  correlationId: z.string().min(1),
});

export type CreateWorkflowRunInput = z.infer<typeof CreateWorkflowRunSchema>;
