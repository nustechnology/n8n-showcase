import { Body, Controller, ForbiddenException, Get, Param, Patch, Sse } from '@nestjs/common';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { RealtimeService } from '../realtime/realtime.service';

import { TenantsService } from './tenants.service';

import { UpdateTenantInput, UpdateTenantSchema } from './dto/update-tenant.schema';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get('me')
  getMe(@CurrentTenant() tenantId: string) {
    return this.tenants.getCurrentTenant(tenantId);
  }

  @Patch('me')
  @RequirePermission('tenant:manage')
  updateMe(
    @CurrentTenant() tenantId: string,
    @Body(new ZodValidationPipe(UpdateTenantSchema)) body: UpdateTenantInput,
  ) {
    return this.tenants.updateCurrentTenant(tenantId, body);
  }

  // Every other route here is `me`-scoped via CLS — this one takes a
  // client-supplied :id because the handoff doc's contract locks the path,
  // but it's never legitimate for that id to differ from the caller's own
  // tenant, so that's checked explicitly rather than trusted.
  @Sse(':id/activity/stream')
  @RequirePermission('orders:read')
  activityStream(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    if (id !== tenantId) {
      throw new ForbiddenException('Cannot subscribe to another workspace\'s activity stream');
    }
    return this.realtime.streamTenantActivity(tenantId);
  }
}
