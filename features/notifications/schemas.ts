import { z } from "zod";

// `readAt: null` means unread, matching the nullable-timestamp convention
// used elsewhere in this codebase (e.g. WorkflowRun.finishedAt) rather than
// a separate boolean.
export const notificationSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  type: z.string(),
  message: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

// GET /notifications returns { items, unreadCount }, not a bare array —
// confirmed against the running backend (automation-experience-center-be,
// src/notifications/notifications.service.ts). unreadCount is
// server-computed rather than derived by filtering `items` client-side.
export const notificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number(),
});
