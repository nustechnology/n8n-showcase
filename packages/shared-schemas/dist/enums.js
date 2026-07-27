"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicProviderSchema = exports.integrationProviderSchema = exports.integrationStatusSchema = exports.workflowStepStatusSchema = exports.workflowRunStatusSchema = exports.orderStatusSchema = void 0;
const zod_1 = require("zod");
exports.orderStatusSchema = zod_1.z.enum([
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
exports.workflowRunStatusSchema = zod_1.z.enum([
    "PENDING",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "CANCELED",
]);
exports.workflowStepStatusSchema = zod_1.z.enum([
    "PENDING",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "SKIPPED",
]);
exports.integrationStatusSchema = zod_1.z.enum([
    "DISCONNECTED",
    "CONNECTING",
    "ACTIVE",
    "DEGRADED",
    "ERROR",
]);
exports.integrationProviderSchema = zod_1.z.enum([
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
exports.publicProviderSchema = zod_1.z.enum([
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
//# sourceMappingURL=enums.js.map