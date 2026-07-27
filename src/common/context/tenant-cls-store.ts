import { ClsStore } from 'nestjs-cls';

// Populated by ClerkTenantGuard once per request, after JWT verification and
// tenant resolution succeed. Nothing else should write to this store.
export interface TenantClsStore extends ClsStore {
  tenantId: string;
  userId: string;
  clerkOrgId: string;
  clerkUserId: string;
  orgRole?: string;
  orgSlug?: string;
}
