import type { ApiFetch } from "@/hooks/use-api-client";

import { notificationsResponseSchema } from "./schemas";

export async function listNotifications(api: ApiFetch) {
  const data = await api<unknown>("/notifications");
  return notificationsResponseSchema.parse(data);
}

export function markNotificationRead(api: ApiFetch, id: string) {
  return api<undefined>(`/notifications/${id}/read`, { method: "PATCH" });
}
