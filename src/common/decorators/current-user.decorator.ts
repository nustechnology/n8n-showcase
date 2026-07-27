import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { ClsServiceManager } from 'nestjs-cls';

import { TenantClsStore } from '../context/tenant-cls-store';

// The Clerk user id (`sub` claim) for the caller of this request.
export const CurrentUser = createParamDecorator((_: unknown, __: ExecutionContext): string => {
  const cls = ClsServiceManager.getClsService<TenantClsStore>();
  return cls.get('clerkUserId');
});
