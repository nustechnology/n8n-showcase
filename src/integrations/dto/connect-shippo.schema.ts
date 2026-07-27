import { z } from 'zod';

export const ConnectShippoSchema = z.object({
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

export type ConnectShippoInput = z.infer<typeof ConnectShippoSchema>;
