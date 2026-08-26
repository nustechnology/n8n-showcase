import { z } from 'zod';

export const CheckInventorySchema = z.object({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
});
export type CheckInventoryInput = z.infer<typeof CheckInventorySchema>;

export const CreateShipmentSchema = z.object({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
});
export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>;

export const UpdateShopifyOrderSchema = z.object({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  trackingNumber: z.string().min(1),
  carrier: z.string().min(1),
});
export type UpdateShopifyOrderInput = z.infer<typeof UpdateShopifyOrderSchema>;

export const SendSlackMessageSchema = z.object({
  tenantId: z.string().min(1),
  message: z.string().min(1),
});
export type SendSlackMessageInput = z.infer<typeof SendSlackMessageSchema>;

export const SendResendEmailSchema = z.object({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
});
export type SendResendEmailInput = z.infer<typeof SendResendEmailSchema>;

export const CheckCartCheckoutSchema = z.object({
  tenantId: z.string().min(1),
  cartToken: z.string().min(1),
});
export type CheckCartCheckoutInput = z.infer<typeof CheckCartCheckoutSchema>;

export const SendCartReminderEmailSchema = z.object({
  tenantId: z.string().min(1),
  toEmail: z.string().email(),
  customerName: z.string().nullable().optional(),
  itemNames: z.array(z.string()),
});
export type SendCartReminderEmailInput = z.infer<typeof SendCartReminderEmailSchema>;
