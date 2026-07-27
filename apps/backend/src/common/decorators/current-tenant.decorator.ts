import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { ClsServiceManager } from 'nestjs-cls';

import { TenantClsStore } from '../context/tenant-cls-store';

// Reads the tenant id ClerkTenantGuard already resolved for this request,
// e.g. `findOrders(@CurrentTenant() tenantId: string)`.
export const CurrentTenant = createParamDecorator((_: unknown, __: ExecutionContext): string => {
  const cls = ClsServiceManager.getClsService<TenantClsStore>();
  return cls.get('tenantId');
});
