import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { ClsServiceManager } from 'nestjs-cls';

import { TenantClsStore } from '../context/tenant-cls-store';

// The internal User.id (not the Clerk user id — see CurrentUser for that)
// for the caller of this request. Used where a service needs to write an
// actor reference into our own tables, e.g. AuditLog.userId.
export const CurrentUserId = createParamDecorator((_: unknown, __: ExecutionContext): string => {
  const cls = ClsServiceManager.getClsService<TenantClsStore>();
  return cls.get('userId');
});
