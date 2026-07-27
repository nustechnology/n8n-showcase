import { z } from "zod";
export declare const InviteMemberSchema: z.ZodObject<{
    email: z.ZodString;
    role: z.ZodEnum<{
        Admin: "Admin";
        Operator: "Operator";
        Viewer: "Viewer";
    }>;
}, z.core.$strip>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export declare const UpdateMemberSchema: z.ZodObject<{
    role: z.ZodEnum<{
        Admin: "Admin";
        Operator: "Operator";
        Viewer: "Viewer";
    }>;
}, z.core.$strip>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
//# sourceMappingURL=member-schemas.d.ts.map