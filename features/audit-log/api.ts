import type { ApiFetch } from "@/hooks/use-api-client";

import { auditLogResponseSchema } from "./schemas";

export async function listAuditLog(api: ApiFetch) {
  const data = await api<unknown>("/audit-logs");
  return auditLogResponseSchema.parse(data);
}
