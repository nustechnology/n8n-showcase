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
