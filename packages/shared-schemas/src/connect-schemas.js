"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectOdooSchema = exports.ConnectDiscordSchema = exports.ConnectSlackSchema = exports.ConnectMailgunSchema = exports.ConnectSendGridSchema = exports.ConnectResendSchema = exports.ConnectShippoSchema = exports.ConnectEasyPostSchema = exports.ConnectShopifySchema = void 0;
const zod_1 = require("zod");
const fromAddressSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    company: zod_1.z.string().optional(),
    street1: zod_1.z.string().min(1),
    street2: zod_1.z.string().optional(),
    city: zod_1.z.string().min(1),
    state: zod_1.z.string().min(1),
    zip: zod_1.z.string().min(1),
    country: zod_1.z.string().min(1),
    phone: zod_1.z.string().optional(),
});
exports.ConnectShopifySchema = zod_1.z.object({
    shop: zod_1.z
        .string()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/, "shop must be a *.myshopify.com domain"),
});
exports.ConnectEasyPostSchema = zod_1.z.object({
    apiKey: zod_1.z.string().min(1, "apiKey is required"),
    fromAddress: fromAddressSchema,
});
exports.ConnectShippoSchema = zod_1.z.object({
    apiKey: zod_1.z.string().min(1, "apiKey is required"),
    fromAddress: fromAddressSchema,
});
exports.ConnectResendSchema = zod_1.z.object({
    apiKey: zod_1.z.string().min(1, "apiKey is required"),
});
exports.ConnectSendGridSchema = zod_1.z.object({
    apiKey: zod_1.z.string().min(1, "apiKey is required"),
});
exports.ConnectMailgunSchema = zod_1.z.object({
    domain: zod_1.z.string().min(1, "domain is required"),
    apiKey: zod_1.z.string().min(1, "apiKey is required"),
});
exports.ConnectSlackSchema = zod_1.z.object({
    webhookUrl: zod_1.z
        .string()
        .url()
        .regex(/^https:\/\/hooks\.slack\.com\//, "webhookUrl must be a Slack incoming-webhook URL"),
});
exports.ConnectDiscordSchema = zod_1.z.object({
    webhookUrl: zod_1.z
        .string()
        .url()
        .regex(/^https:\/\/discord\.com\/api\/webhooks\//, "webhookUrl must be a Discord webhook URL"),
});
exports.ConnectOdooSchema = zod_1.z.object({
    url: zod_1.z.string().url("Enter a valid Odoo instance URL"),
    db: zod_1.z.string().min(1, "Database name is required"),
    username: zod_1.z.string().min(1, "Username is required"),
    apiKey: zod_1.z.string().min(1, "API key is required"),
});
//# sourceMappingURL=connect-schemas.js.map