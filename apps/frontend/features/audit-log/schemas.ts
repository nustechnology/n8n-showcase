import { z } from "zod";

// userId is null for the two OAuth callback paths (Shopify/Zoho) — no
// Clerk session on those, verified by HMAC/state instead (backend API
// contract). `user` is the resolved actor (included by the backend), also
// null for the same rows.
export const auditLogEntrySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  userId: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
});

// GET /audit-logs returns { items, total }, same pagination shape as
// GET /notifications's { items, unreadCount }.
export const auditLogResponseSchema = z.object({
  items: z.array(auditLogEntrySchema),
  total: z.number(),
});
