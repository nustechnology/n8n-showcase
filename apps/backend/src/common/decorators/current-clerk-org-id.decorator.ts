import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { ClsServiceManager } from 'nestjs-cls';

import { TenantClsStore } from '../context/tenant-cls-store';

export const CurrentClerkOrgId = createParamDecorator(
  (_: unknown, __: ExecutionContext): string => {
    const cls = ClsServiceManager.getClsService<TenantClsStore>();
    return cls.get('clerkOrgId');
  },
);
