import { z } from "zod";
export declare const orderStatusSchema: z.ZodEnum<{
    RECEIVED: "RECEIVED";
    VALIDATING: "VALIDATING";
    VALIDATED: "VALIDATED";
    VALIDATION_FAILED: "VALIDATION_FAILED";
    INVENTORY_CHECKED: "INVENTORY_CHECKED";
    SHIPMENT_CREATED: "SHIPMENT_CREATED";
    FULFILLED: "FULFILLED";
    NOTIFIED: "NOTIFIED";
    COMPLETED: "COMPLETED";
    CANCELED: "CANCELED";
    FAILED: "FAILED";
}>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export declare const workflowRunStatusSchema: z.ZodEnum<{
    CANCELED: "CANCELED";
    FAILED: "FAILED";
    PENDING: "PENDING";
    RUNNING: "RUNNING";
    SUCCEEDED: "SUCCEEDED";
}>;
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;
export declare const workflowStepStatusSchema: z.ZodEnum<{
    FAILED: "FAILED";
    PENDING: "PENDING";
    RUNNING: "RUNNING";
    SUCCEEDED: "SUCCEEDED";
    SKIPPED: "SKIPPED";
}>;
export type WorkflowStepStatus = z.infer<typeof workflowStepStatusSchema>;
export declare const integrationStatusSchema: z.ZodEnum<{
    DISCONNECTED: "DISCONNECTED";
    CONNECTING: "CONNECTING";
    ACTIVE: "ACTIVE";
    DEGRADED: "DEGRADED";
    ERROR: "ERROR";
}>;
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;
export declare const integrationProviderSchema: z.ZodEnum<{
    SHOPIFY: "SHOPIFY";
    ZOHO_INVENTORY: "ZOHO_INVENTORY";
    ODOO: "ODOO";
    EASYPOST: "EASYPOST";
    SHIPPO: "SHIPPO";
    RESEND: "RESEND";
    SENDGRID: "SENDGRID";
    MAILGUN: "MAILGUN";
    SLACK: "SLACK";
    DISCORD: "DISCORD";
    OPENAI: "OPENAI";
}>;
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
export declare const publicProviderSchema: z.ZodEnum<{
    SHOPIFY: "SHOPIFY";
    ZOHO_INVENTORY: "ZOHO_INVENTORY";
    ODOO: "ODOO";
    EASYPOST: "EASYPOST";
    SHIPPO: "SHIPPO";
    RESEND: "RESEND";
    SENDGRID: "SENDGRID";
    MAILGUN: "MAILGUN";
    SLACK: "SLACK";
    DISCORD: "DISCORD";
}>;
export type PublicProvider = z.infer<typeof publicProviderSchema>;
//# sourceMappingURL=enums.d.ts.map