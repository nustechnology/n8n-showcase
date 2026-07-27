import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { ClerkBackendService, ClerkOrgRole } from '../auth/clerk-backend.service';

import { InviteMemberInput } from './dto/invite-member.schema';
import { UpdateMemberInput } from './dto/update-member.schema';

// Mirrors ClerkWebhookService.resolveRoleName in the other direction: our
// 4-tier app role -> Clerk's own 2-tier org role. Owner is intentionally
// absent — see InviteMemberSchema/UpdateMemberSchema.
const APP_ROLE_TO_CLERK_ROLE: Record<'Admin' | 'Operator' | 'Viewer', ClerkOrgRole> = {
  Admin: 'org:admin',
  Operator: 'org:member',
  Viewer: 'org:member',
};

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkBackend: ClerkBackendService,
  ) {}

  async listForTenant(tenantId: string) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId, status: { not: 'REMOVED' } },
      include: {
        user: { select: { id: true, email: true, name: true } },
        role: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      membershipId: membership.id,
      status: membership.status,
      role: membership.role.name,
      joinedAt: membership.joinedAt,
      user: membership.user,
    }));
  }

  async invite(
    tenantId: string,
    actorUserId: string,
    actorClerkUserId: string,
    input: InviteMemberInput,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { clerkOrgId: true },
    });

    await this.clerkBackend.createInvitation({
      clerkOrgId: tenant.clerkOrgId,
      inviterClerkUserId: actorClerkUserId,
      email: input.email,
      clerkRole: APP_ROLE_TO_CLERK_ROLE[input.role],
      appRole: input.role,
    });

    // No local row to write yet — TenantMembership.userId is a required FK
    // to User, and no User row exists for an invitee until they actually
    // accept and Clerk fires organizationMembership.created (handled by
    // the existing webhook, ClerkWebhookService.onMembershipCreated).
    await this.writeAudit(tenantId, actorUserId, 'member.invited', undefined, {
      email: input.email,
      role: input.role,
    });
  }

  async updateRole(
    tenantId: string,
    actorUserId: string,
    membershipId: string,
    input: UpdateMemberInput,
  ): Promise<void> {
    const membership = await this.findMembershipOrThrow(tenantId, membershipId);
    if (membership.role.name === 'Owner') {
      throw new ForbiddenException("The workspace Owner's role cannot be changed here");
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { clerkOrgId: true },
    });
    const role = await this.prisma.role.findFirstOrThrow({
      where: { tenantId: null, name: input.role },
    });
    const clerkUserId = membership.user.clerkUserId;
    const clerkRole = APP_ROLE_TO_CLERK_ROLE[input.role];

    // Metadata BEFORE role, deliberately: the role PATCH below is what
    // triggers Clerk's organizationMembership.updated webhook, and that
    // webhook resolves Operator vs Viewer purely from public_metadata.
    // appRole (Clerk's own role field can't tell them apart — both are
    // org:member). Writing metadata first means the webhook — whenever it
    // arrives — always sees the correct hint, instead of racing this
    // request's second call.
    await this.clerkBackend.updateMembershipMetadata({
      clerkOrgId: tenant.clerkOrgId,
      clerkUserId,
      appRole: input.role,
    });
    await this.clerkBackend.updateMembershipRole({
      clerkOrgId: tenant.clerkOrgId,
      clerkUserId,
      clerkRole,
    });

    // Applied directly rather than waiting on that same webhook to loop
    // back — the caller of this endpoint shouldn't have to wait on Clerk's
    // webhook delivery to see the change reflected. The webhook re-applies
    // the identical roleId when it does arrive (idempotent updateMany).
    await this.prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { roleId: role.id },
    });

    await this.writeAudit(tenantId, actorUserId, 'member.role_changed', membershipId, {
      newRole: input.role,
    });
  }

  async remove(tenantId: string, actorUserId: string, membershipId: string): Promise<void> {
    const membership = await this.findMembershipOrThrow(tenantId, membershipId);
    if (membership.role.name === 'Owner') {
      throw new ForbiddenException('The workspace Owner cannot be removed');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { clerkOrgId: true },
    });

    await this.clerkBackend.removeMembership({
      clerkOrgId: tenant.clerkOrgId,
      clerkUserId: membership.user.clerkUserId,
    });
    await this.prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { status: 'REMOVED' },
    });

    await this.writeAudit(tenantId, actorUserId, 'member.removed', membershipId, {});
  }

  private async findMembershipOrThrow(tenantId: string, membershipId: string) {
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      include: {
        user: { select: { clerkUserId: true } },
        role: { select: { name: true } },
      },
    });
    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException('Member not found');
    }
    return membership;
  }

  private async writeAudit(
    tenantId: string,
    userId: string,
    action: string,
    resourceId: string | undefined,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        resourceType: 'TenantMembership',
        resourceId: resourceId ?? null,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
