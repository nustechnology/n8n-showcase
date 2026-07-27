"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateMemberSchema = exports.InviteMemberSchema = void 0;
const zod_1 = require("zod");
exports.InviteMemberSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email("must be a valid email address"),
    role: zod_1.z.enum(["Admin", "Operator", "Viewer"]),
});
exports.UpdateMemberSchema = zod_1.z.object({
    role: zod_1.z.enum(["Admin", "Operator", "Viewer"]),
});
//# sourceMappingURL=member-schemas.js.map