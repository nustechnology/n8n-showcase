import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route (or a whole controller) as exempt from ClerkTenantGuard —
// health checks and inbound webhooks (which authenticate via provider
// signatures, not a Clerk session) use this.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
