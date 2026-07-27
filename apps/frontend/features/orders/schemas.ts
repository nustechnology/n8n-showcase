import { z } from "zod";

// Verbatim backend enum (backend API contract §3) — must stay in sync with
// OrderStatus in apps/backend/prisma/schema.prisma. A
// value present in the Prisma enum but missing here breaks the entire
// GET /orders list, not just the one row with that status: zod fails the
// whole array parse on a single invalid element.
export const orderStatusSchema = z.enum([
  "RECEIVED",
  "VALIDATING",
  "VALIDATED",
  "VALIDATION_FAILED",
  "INVENTORY_CHECKED",
  "SHIPMENT_CREATED",
  "FULFILLED",
  "NOTIFIED",
  "COMPLETED",
  "FAILED",
  "CANCELED",
]);

export const orderSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  shopifyOrderId: z.string(),
  status: orderStatusSchema,
  customerEmail: z.string().nullable(),
  customerName: z.string().nullable(),
  currency: z.string().nullable(),
  // Decimal serialized as a string, e.g. "249.50" — never coerce to number.
  totalAmount: z.string().nullable(),
  rawPayload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ordersResponseSchema = z.array(orderSchema);

export const orderEventSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  tenantId: z.string(),
  // Free-form — known values include "order_received", "order_failed"
  // (payload: { reason }, one of the mapFailureReason enum values) and
  // "manual_override" (payload: { from, to, reason }, reason is free text).
  eventType: z.string(),
  actor: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

export const orderTimelineResponseSchema = z.array(orderEventSchema);
