import { z } from "zod";

const fromAddressSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().min(1),
  phone: z.string().optional(),
});

export const ConnectShopifySchema = z.object({
  shop: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/, "shop must be a *.myshopify.com domain"),
});
export type ConnectShopifyInput = z.infer<typeof ConnectShopifySchema>;

export const ConnectEasyPostSchema = z.object({
  apiKey: z.string().min(1, "apiKey is required"),
  fromAddress: fromAddressSchema,
});
export type ConnectEasyPostInput = z.infer<typeof ConnectEasyPostSchema>;

export const ConnectShippoSchema = z.object({
  apiKey: z.string().min(1, "apiKey is required"),
  fromAddress: fromAddressSchema,
});
export type ConnectShippoInput = z.infer<typeof ConnectShippoSchema>;

export const ConnectResendSchema = z.object({
  apiKey: z.string().min(1, "apiKey is required"),
});
export type ConnectResendInput = z.infer<typeof ConnectResendSchema>;

export const ConnectSendGridSchema = z.object({
  apiKey: z.string().min(1, "apiKey is required"),
});
export type ConnectSendGridInput = z.infer<typeof ConnectSendGridSchema>;

export const ConnectMailgunSchema = z.object({
  domain: z.string().min(1, "domain is required"),
  apiKey: z.string().min(1, "apiKey is required"),
});
export type ConnectMailgunInput = z.infer<typeof ConnectMailgunSchema>;

export const ConnectSlackSchema = z.object({
  webhookUrl: z
    .string()
    .url()
    .regex(/^https:\/\/hooks\.slack\.com\//, "webhookUrl must be a Slack incoming-webhook URL"),
});
export type ConnectSlackInput = z.infer<typeof ConnectSlackSchema>;

export const ConnectDiscordSchema = z.object({
  webhookUrl: z
    .string()
    .url()
    .regex(/^https:\/\/discord\.com\/api\/webhooks\//, "webhookUrl must be a Discord webhook URL"),
});
export type ConnectDiscordInput = z.infer<typeof ConnectDiscordSchema>;

export const ConnectOdooSchema = z.object({
  url: z.string().url("Enter a valid Odoo instance URL"),
  db: z.string().min(1, "Database name is required"),
  username: z.string().min(1, "Username is required"),
  apiKey: z.string().min(1, "API key is required"),
});
export type ConnectOdooInput = z.infer<typeof ConnectOdooSchema>;
