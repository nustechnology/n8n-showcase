import { z } from 'zod';

// Same restriction as InviteMemberSchema — Owner can't be granted through
// this endpoint either (see MembersService.updateRole for the guard that
// also stops the current Owner's own membership from being changed here).
export const UpdateMemberSchema = z.object({
  role: z.enum(['Admin', 'Operator', 'Viewer']),
});

export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
