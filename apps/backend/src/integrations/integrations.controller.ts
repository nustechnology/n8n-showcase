import { Body, Controller, Delete, Get, Param, Post, Query, Res } from '@nestjs/common';

import { Response } from 'express';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator';
import { Public } from '../common/decorators/public.decorator';

import { IntegrationsService } from './integrations.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermission('integrations:read')
  list(@CurrentTenant() tenantId: string) {
    return this.integrations.listForTenant(tenantId);
  }

  @Post(':provider/connect')
  @RequirePermission('integrations:manage')
  connect(
    @CurrentTenant() tenantId: string,
    @CurrentUserId() actorUserId: string,
    @Param('provider') provider: string,
    @Body() body: unknown,
  ) {
    return this.integrations.initConnect(tenantId, actorUserId, provider, body);
  }

  // No Clerk session on a provider's OAuth redirect — this is verified by
  // the provider's own HMAC instead (see IntegrationsService.handleCallback).
  @Public()
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    const { redirectUrl } = await this.integrations.handleCallback(provider, query);
    res.redirect(302, redirectUrl);
  }

  @Post(':provider/test')
  @RequirePermission('integrations:test')
  test(@CurrentTenant() tenantId: string, @Param('provider') provider: string) {
    return this.integrations.test(tenantId, provider);
  }

  @Delete(':provider')
  @RequirePermission('integrations:manage')
  disconnect(
    @CurrentTenant() tenantId: string,
    @CurrentUserId() actorUserId: string,
    @Param('provider') provider: string,
  ) {
    return this.integrations.disconnect(tenantId, actorUserId, provider);
  }
}
