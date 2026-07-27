import { z } from "zod";

export const InviteMemberSchema = z.object({
  email: z.string().trim().email("must be a valid email address"),
  role: z.enum(["Admin", "Operator", "Viewer"]),
});
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

export const UpdateMemberSchema = z.object({
  role: z.enum(["Admin", "Operator", "Viewer"]),
});
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
