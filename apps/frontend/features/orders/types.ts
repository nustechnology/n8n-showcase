import type { z } from "zod";

import type { orderEventSchema, orderSchema, orderStatusSchema } from "./schemas";

export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Validated at the API boundary — see api.ts. */
export type Order = z.infer<typeof orderSchema>;

export type OrderEvent = z.infer<typeof orderEventSchema>;
