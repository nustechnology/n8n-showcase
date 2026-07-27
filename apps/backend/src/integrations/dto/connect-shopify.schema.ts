import { z } from 'zod';

export const ConnectShopifySchema = z.object({
  shop: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/, 'shop must be a *.myshopify.com domain'),
});

export type ConnectShopifyInput = z.infer<typeof ConnectShopifySchema>;
