import { z } from 'zod';

// EasyPost requires an explicit from_address on every shipment request (no
// account-level default warehouse like ShipStation's dashboard-configured
// one) — collected once at connect time and stored in Integration.config
// (non-secret, alongside the encrypted API key) rather than re-asked per
// shipment.
export const ConnectEasyPostSchema = z.object({
  apiKey: z.string().min(1, 'apiKey is required'),
  fromAddress: z.object({
    name: z.string().min(1),
    company: z.string().optional(),
    street1: z.string().min(1),
    street2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    zip: z.string().min(1),
    country: z.string().min(1),
    phone: z.string().optional(),
  }),
});

export type ConnectEasyPostInput = z.infer<typeof ConnectEasyPostSchema>;
