import { z } from 'zod';

// Owner is deliberately not an invitable role — it's reserved for whoever
// creates the Clerk org (see ClerkWebhookService.resolveRoleName), and
// there's no supported path to grant it after the fact.
export const InviteMemberSchema = z.object({
  email: z.string().trim().email('must be a valid email address'),
  role: z.enum(['Admin', 'Operator', 'Viewer']),
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
