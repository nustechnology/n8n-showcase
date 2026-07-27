import type { z } from "zod";

import type { notificationSchema } from "./schemas";

/** Validated at the API boundary — see api.ts. */
export type Notification = z.infer<typeof notificationSchema>;
