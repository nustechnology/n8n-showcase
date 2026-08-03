import { z } from 'zod';

// Static ordering, not client-supplied — sequence must be stable across
// retries (n8n can call this endpoint out of order on a retry), so a
// per-call auto-increment would misorder the stepper UI. An unknown
// stepKey is a 400 via the enum below, not a silent default.
// Keys match the stepKey values the n8n workflow's "Record ... Step" nodes
// actually send (order-validation.json) — not a value this schema is free
// to pick independently, since a mismatch here is a silent 400 with no
// caller-visible signal until someone reads an n8n execution log.
export const STEP_KEYS = [
  'validate_order',
  'check_inventory',
  'create_shipment',
  'update_shopify',
  'notify_slack',
  'notify_email',
  'check_checkout_order',
  'send_cart_reminder',
] as const;

export const STEP_DEFINITIONS: Record<(typeof STEP_KEYS)[number], { label: string; sequence: number }> = {
  validate_order: { label: 'Validate Order', sequence: 1 },
  check_inventory: { label: 'Check Inventory', sequence: 2 },
  create_shipment: { label: 'Create Shipment', sequence: 3 },
  update_shopify: { label: 'Update Shopify Order', sequence: 4 },
  notify_slack: { label: 'Notify Slack', sequence: 5 },
  notify_email: { label: 'Notify Email', sequence: 6 },
  check_checkout_order: { label: 'Check Checkout Order', sequence: 1 },
  send_cart_reminder: { label: 'Send Cart Reminder', sequence: 2 },
};

// Wire values are lowercase, same convention as UpdateOrderStatusSchema —
// n8n sends 'succeeded' | 'failed' | 'skipped', not the Prisma
// WorkflowStepStatus enum's own casing. Mapped to the enum in
// InternalService (WORKFLOW_STEP_STATUS_BY_WIRE_VALUE).
export const CreateWorkflowRunStepSchema = z.object({
  stepKey: z.enum(STEP_KEYS),
  status: z.enum(['succeeded', 'failed', 'skipped']),
  error: z.record(z.string(), z.unknown()).optional(),
});

export type CreateWorkflowRunStepInput = z.infer<typeof CreateWorkflowRunStepSchema>;
