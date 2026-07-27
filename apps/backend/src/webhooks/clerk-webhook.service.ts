import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  ClerkOrganizationData,
  ClerkOrganizationMembershipData,
  ClerkUserData,
  ClerkWebhookEvent,
} from './clerk-webhook-event.types';

@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(event: ClerkWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'organization.created':
        return this.onOrganizationCreated(event.data as ClerkOrganizationData);
      case 'organization.updated':
        return this.onOrganizationUpdated(event.data as ClerkOrganizationData);
      case 'organization.deleted':
        return this.onOrganizationDeleted(event.data as { id: string });
      case 'user.created':
      case 'user.updated':
        return this.onUserUpserted(event.data as ClerkUserData);
      case 'organizationMembership.created':
        return this.onMembershipCreated(event.data as ClerkOrganizationMembershipData);
      case 'organizationMembership.updated':
        return this.onMembershipUpdated(event.data as ClerkOrganizationMembershipData);
      case 'organizationMembership.deleted':
        return this.onMembershipDeleted(event.data as ClerkOrganizationMembershipData);
      default:
        this.logger.debug(`Ignoring unhandled Clerk event type: ${event.type}`);
    }
  }

  private async onOrganizationCreated(data: ClerkOrganizationData): Promise<void> {
    await this.prisma.tenant.upsert({
      where: { clerkOrgId: data.id },
      create: {
        clerkOrgId: data.id,
        slug: data.slug ?? data.id,
        name: data.name,
        plan: 'TRIAL',
        status: 'ACTIVE',
      },
      update: { name: data.name, slug: data.slug ?? data.id },
    });
  }

  private async onOrganizationUpdated(data: ClerkOrganizationData): Promise<void> {
    // updateMany, not update: a no-op if the tenant doesn't exist yet is
    // preferable to throwing on an out-of-order webhook delivery.
    await this.prisma.tenant.updateMany({
      where: { clerkOrgId: data.id },
      data: { name: data.name, slug: data.slug ?? data.id },
    });
  }

  private async onOrganizationDeleted(data: { id: string }): Promise<void> {
    // Soft-cancel, never hard-delete — orders/audit history hang off this
    // tenant and a Clerk-side org deletion shouldn't take them with it.
    await this.prisma.tenant.updateMany({
      where: { clerkOrgId: data.id },
      data: { status: 'CANCELED' },
    });
  }

  private async onUserUpserted(data: ClerkUserData): Promise<void> {
    const email =
      data.email_addresses.find((e) => e.id === data.primary_email_address_id)?.email_address ??
      data.email_addresses[0]?.email_address;
    if (!email) {
      this.logger.warn(`Clerk user ${data.id} has no email address, skipping`);
      return;
    }
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;
    await this.prisma.user.upsert({
      where: { clerkUserId: data.id },
      create: { clerkUserId: data.id, email, name },
      update: { email, name },
    });
  }

  private async onMembershipCreated(data: ClerkOrganizationMembershipData): Promise<void> {
    // Deliberately throws instead of silently skipping when the tenant/user
    // isn't resolvable yet — observed in practice: Clerk creates an org and
    // fires the creator's own organizationMembership.created essentially
    // simultaneously with organization.created, and delivery order isn't
    // guaranteed, so this membership event can genuinely arrive first.
    // Throwing marks this row FAILED (see ClerkWebhookController) instead
    // of a falsely reassuring PROCESSED with no membership actually
    // created — FAILED is what gives a real trail to follow up on, the
    // same "resend from Clerk once the prerequisite has landed" recovery
    // already used for any other failed webhook.
    const tenant = await this.prisma.tenant.findUnique({
      where: { clerkOrgId: data.organization.id },
    });
    if (!tenant) {
      throw new Error(
        `Membership created for unknown org ${data.organization.id} — likely arrived before organization.created; resend from Clerk once the tenant exists`,
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId: data.public_user_data.user_id },
    });
    if (!user) {
      throw new Error(
        `Membership created for unknown user ${data.public_user_data.user_id} — likely arrived before user.created; resend from Clerk once the user exists`,
      );
    }

    const isFirstMembership =
      (await this.prisma.tenantMembership.count({ where: { tenantId: tenant.id } })) === 0;
    const role = await this.findSystemRole(
      this.resolveRoleName(data.role, isFirstMembership, data.public_metadata?.appRole),
    );
    if (!role) return;

    await this.prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        roleId: role.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
      update: { roleId: role.id, status: 'ACTIVE', joinedAt: new Date() },
    });
  }

  private async onMembershipUpdated(data: ClerkOrganizationMembershipData): Promise<void> {
    // Same reasoning as onMembershipCreated: throw rather than silently
    // skip on an unresolved tenant/user, so an out-of-order delivery is
    // visible as FAILED and recoverable via a manual resend, not silently
    // lost as a falsely-PROCESSED no-op.
    const tenant = await this.prisma.tenant.findUnique({
      where: { clerkOrgId: data.organization.id },
    });
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId: data.public_user_data.user_id },
    });
    if (!tenant || !user) {
      throw new Error(
        `Membership updated for unresolved org ${data.organization.id} / user ${data.public_user_data.user_id} — resend from Clerk once both exist`,
      );
    }

    const role = await this.findSystemRole(
      this.resolveRoleName(data.role, false, data.public_metadata?.appRole),
    );
    if (!role) return;

    await this.prisma.tenantMembership.updateMany({
      where: { tenantId: tenant.id, userId: user.id },
      data: { roleId: role.id },
    });
  }

  private async onMembershipDeleted(data: ClerkOrganizationMembershipData): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { clerkOrgId: data.organization.id },
    });
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId: data.public_user_data.user_id },
    });
    if (!tenant || !user) return;

    await this.prisma.tenantMembership.updateMany({
      where: { tenantId: tenant.id, userId: user.id },
      data: { status: 'REMOVED' },
    });
  }

  private async findSystemRole(name: string) {
    const role = await this.prisma.role.findFirst({ where: { tenantId: null, name } });
    if (!role) {
      this.logger.error(`System role "${name}" not found — did prisma:seed run?`);
    }
    return role;
  }

  private static readonly APP_ROLES = ['Owner', 'Admin', 'Operator', 'Viewer'];

  /**
   * Clerk's own org roles are coarse (admin/member) and have no concept of
   * "Owner" or "Viewer" — so this is our heuristic, not something Clerk
   * tells us directly, EXCEPT when `appRoleHint` is present: MembersService
   * sets it via Clerk's invitation/membership metadata (public_metadata.
   * appRole) whenever a membership went through our own invite or
   * role-change flow, and that's authoritative over the coarse guess below.
   * Without a hint: the first admin membership on a brand-new tenant is the
   * Owner, every other admin membership is an Admin, and plain members land
   * as Operator (a sensible non-privileged default — this is the case for
   * the org creator and for anyone added directly from Clerk's own
   * dashboard rather than through our invite endpoint).
   */
  private resolveRoleName(
    clerkOrgRole: string,
    isFirstMembership: boolean,
    appRoleHint?: string,
  ): string {
    if (appRoleHint && ClerkWebhookService.APP_ROLES.includes(appRoleHint)) {
      return appRoleHint;
    }
    if (clerkOrgRole === 'org:admin') {
      return isFirstMembership ? 'Owner' : 'Admin';
    }
    return 'Operator';
  }
}
