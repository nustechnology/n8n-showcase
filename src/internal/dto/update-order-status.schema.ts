import { z } from 'zod';

// Wire values match what the n8n workflow's HTTP Request nodes send —
// lowercase, not the Prisma OrderStatus enum's own casing. Extended in
// Phase 3 with the inventory/shipment/fulfillment/notification steps, plus
// "failed" for the three hard-failure branches (out of stock, shipment
// creation, Shopify writeback) — deliberately NOT including "completed":
// that status is only reachable via the tenant-facing, human-only
// PATCH /orders/:id/status (manual override), never the automated pipeline.
// `reason` is only meaningful alongside "failed" — n8n sends it on all
// three hard-failure nodes; recorded as an OrderEvent (see InternalService).
export const UpdateOrderStatusSchema = z.object({
  status: z.enum([
    'validated',
    'validation_failed',
    'inventory_checked',
    'shipment_created',
    'fulfilled',
    'notified',
    'failed',
  ]),
  reason: z.string().optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
