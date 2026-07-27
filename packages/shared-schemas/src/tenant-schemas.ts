import { z } from "zod";

export const UpdateTenantSchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(200, "name is too long"),
});
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
