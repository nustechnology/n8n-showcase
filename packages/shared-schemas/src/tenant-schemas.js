"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateTenantSchema = void 0;
const zod_1 = require("zod");
exports.UpdateTenantSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, "name must not be empty").max(200, "name is too long"),
});
//# sourceMappingURL=tenant-schemas.js.map