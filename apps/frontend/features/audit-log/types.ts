import type { z } from "zod";

import type { auditLogEntrySchema } from "./schemas";

/** Validated at the API boundary — see api.ts. */
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
