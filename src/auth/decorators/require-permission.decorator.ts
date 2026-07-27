import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

// e.g. @RequirePermission('orders:write'). Checked by PermissionsGuard
// against the caller's role in the current tenant (from the seeded
// role_permissions catalog — see prisma/seed.ts). Routes with no
// @RequirePermission are left open to any active tenant member, same as
// before this guard existed.
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
