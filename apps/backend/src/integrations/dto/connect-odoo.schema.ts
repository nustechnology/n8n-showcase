import { z } from 'zod';

export const ConnectOdooSchema = z.object({
  url: z.string().url('Enter a valid Odoo instance URL'),
  db: z.string().min(1, 'Database name is required'),
  username: z.string().min(1, 'Username is required'),
  apiKey: z.string().min(1, 'API key is required'),
});

export type ConnectOdooInput = z.infer<typeof ConnectOdooSchema>;
