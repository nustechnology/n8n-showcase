import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { InviteMemberInput, InviteMemberSchema } from './dto/invite-member.schema';
import { UpdateMemberInput, UpdateMemberSchema } from './dto/update-member.schema';
import { MembersService } from './members.service';

@Controller('tenants/me')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  @RequirePermission('members:read')
  list(@CurrentTenant() tenantId: string) {
    return this.members.listForTenant(tenantId);
  }

  @Post('invitations')
  @RequirePermission('members:manage')
  invite(
    @CurrentTenant() tenantId: string,
    @CurrentUserId() actorUserId: string,
    @CurrentUser() actorClerkUserId: string,
    @Body(new ZodValidationPipe(InviteMemberSchema)) body: InviteMemberInput,
  ) {
    return this.members.invite(tenantId, actorUserId, actorClerkUserId, body);
  }

  @Patch('members/:membershipId')
  @RequirePermission('members:manage')
  updateRole(
    @CurrentTenant() tenantId: string,
    @CurrentUserId() actorUserId: string,
    @Param('membershipId') membershipId: string,
    @Body(new ZodValidationPipe(UpdateMemberSchema)) body: UpdateMemberInput,
  ) {
    return this.members.updateRole(tenantId, actorUserId, membershipId, body);
  }

  @Delete('members/:membershipId')
  @RequirePermission('members:manage')
  remove(
    @CurrentTenant() tenantId: string,
    @CurrentUserId() actorUserId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.members.remove(tenantId, actorUserId, membershipId);
  }
}
