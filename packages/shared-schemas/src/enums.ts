import { z } from "zod";

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
  "CANCELED",
  "FAILED",
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const workflowRunStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
]);
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;

export const workflowStepStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
]);
export type WorkflowStepStatus = z.infer<typeof workflowStepStatusSchema>;

export const integrationStatusSchema = z.enum([
  "DISCONNECTED",
  "CONNECTING",
  "ACTIVE",
  "DEGRADED",
  "ERROR",
]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const integrationProviderSchema = z.enum([
  "SHOPIFY",
  "ZOHO_INVENTORY",
  "ODOO",
  "EASYPOST",
  "SHIPPO",
  "RESEND",
  "SENDGRID",
  "MAILGUN",
  "SLACK",
  "DISCORD",
  "OPENAI",
]);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

export const publicProviderSchema = z.enum([
  "SHOPIFY",
  "ZOHO_INVENTORY",
  "ODOO",
  "EASYPOST",
  "SHIPPO",
  "RESEND",
  "SENDGRID",
  "MAILGUN",
  "SLACK",
  "DISCORD",
]);
export type PublicProvider = z.infer<typeof publicProviderSchema>;
