import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ClerkWebhookService } from './clerk-webhook.service';

describe('ClerkWebhookService', () => {
  let service: ClerkWebhookService;
  let prisma: {
    tenant: { upsert: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock };
    user: { upsert: jest.Mock; findUnique: jest.Mock };
    tenantMembership: { count: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock };
    role: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      tenant: { upsert: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
      user: { upsert: jest.fn(), findUnique: jest.fn() },
      tenantMembership: { count: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
      role: { findFirst: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ClerkWebhookService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ClerkWebhookService);
  });

  it('creates a tenant from organization.created', async () => {
    await service.handle({
      type: 'organization.created',
      data: { id: 'org_1', name: 'Alpha Co', slug: 'alpha' },
    });

    expect(prisma.tenant.upsert).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      create: {
        clerkOrgId: 'org_1',
        slug: 'alpha',
        name: 'Alpha Co',
        plan: 'TRIAL',
        status: 'ACTIVE',
      },
      update: { name: 'Alpha Co', slug: 'alpha' },
    });
  });

  it('falls back to the org id as slug when Clerk sends no slug', async () => {
    await service.handle({
      type: 'organization.created',
      data: { id: 'org_1', name: 'Alpha Co', slug: null },
    });

    expect(prisma.tenant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ slug: 'org_1' }) }),
    );
  });

  it('cancels a tenant on organization.deleted without deleting it', async () => {
    await service.handle({ type: 'organization.deleted', data: { id: 'org_1' } });

    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_1' },
      data: { status: 'CANCELED' },
    });
  });

  it('upserts a user from user.created using the primary email', async () => {
    await service.handle({
      type: 'user.created',
      data: {
        id: 'user_1',
        email_addresses: [
          { id: 'em_2', email_address: 'secondary@example.com' },
          { id: 'em_1', email_address: 'primary@example.com' },
        ],
        primary_email_address_id: 'em_1',
        first_name: 'Ada',
        last_name: 'Lovelace',
      },
    });

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { clerkUserId: 'user_1' },
      create: { clerkUserId: 'user_1', email: 'primary@example.com', name: 'Ada Lovelace' },
      update: { email: 'primary@example.com', name: 'Ada Lovelace' },
    });
  });

  it('skips a user with no email address instead of throwing', async () => {
    await service.handle({
      type: 'user.created',
      data: {
        id: 'user_1',
        email_addresses: [],
        primary_email_address_id: null,
        first_name: null,
        last_name: null,
      },
    });

    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  describe('organizationMembership.created', () => {
    const membershipData = {
      organization: { id: 'org_1' },
      public_user_data: { user_id: 'user_1' },
      role: 'org:admin',
    };

    beforeEach(() => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't_1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u_1' });
      prisma.role.findFirst.mockResolvedValue({ id: 'role_owner' });
    });

    it('assigns Owner to the first admin membership on a tenant', async () => {
      prisma.tenantMembership.count.mockResolvedValue(0);

      await service.handle({ type: 'organizationMembership.created', data: membershipData });

      expect(prisma.role.findFirst).toHaveBeenCalledWith({
        where: { tenantId: null, name: 'Owner' },
      });
    });

    it('assigns Admin to a later admin membership on the same tenant', async () => {
      prisma.tenantMembership.count.mockResolvedValue(1);

      await service.handle({ type: 'organizationMembership.created', data: membershipData });

      expect(prisma.role.findFirst).toHaveBeenCalledWith({
        where: { tenantId: null, name: 'Admin' },
      });
    });

    it('assigns Operator to an org:member', async () => {
      prisma.tenantMembership.count.mockResolvedValue(1);

      await service.handle({
        type: 'organizationMembership.created',
        data: { ...membershipData, role: 'org:member' },
      });

      expect(prisma.role.findFirst).toHaveBeenCalledWith({
        where: { tenantId: null, name: 'Operator' },
      });
    });

    it('prefers the public_metadata.appRole hint over the coarse heuristic (Viewer via our invite flow)', async () => {
      prisma.tenantMembership.count.mockResolvedValue(1);

      await service.handle({
        type: 'organizationMembership.created',
        data: { ...membershipData, role: 'org:member', public_metadata: { appRole: 'Viewer' } },
      });

      expect(prisma.role.findFirst).toHaveBeenCalledWith({
        where: { tenantId: null, name: 'Viewer' },
      });
    });

    it('ignores an unrecognized appRole hint and falls back to the coarse heuristic', async () => {
      prisma.tenantMembership.count.mockResolvedValue(1);

      await service.handle({
        type: 'organizationMembership.created',
        data: { ...membershipData, role: 'org:member', public_metadata: { appRole: 'SuperAdmin' } },
      });

      expect(prisma.role.findFirst).toHaveBeenCalledWith({
        where: { tenantId: null, name: 'Operator' },
      });
    });

    it('upserts the membership as ACTIVE with the resolved role', async () => {
      prisma.tenantMembership.count.mockResolvedValue(0);

      await service.handle({ type: 'organizationMembership.created', data: membershipData });

      expect(prisma.tenantMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_userId: { tenantId: 't_1', userId: 'u_1' } },
          create: expect.objectContaining({
            tenantId: 't_1',
            userId: 'u_1',
            roleId: 'role_owner',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('throws when the org has no matching tenant yet (so the webhook row is marked FAILED, not falsely PROCESSED)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.handle({ type: 'organizationMembership.created', data: membershipData }),
      ).rejects.toThrow(/unknown org/);
      expect(prisma.tenantMembership.upsert).not.toHaveBeenCalled();
    });

    it('throws when the user has no matching row yet', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.handle({ type: 'organizationMembership.created', data: membershipData }),
      ).rejects.toThrow(/unknown user/);
      expect(prisma.tenantMembership.upsert).not.toHaveBeenCalled();
    });
  });

  describe('organizationMembership.updated', () => {
    const membershipData = {
      organization: { id: 'org_1' },
      public_user_data: { user_id: 'user_1' },
      role: 'org:admin',
    };

    it('throws when the tenant or user is not resolvable yet', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'u_1' });

      await expect(
        service.handle({ type: 'organizationMembership.updated', data: membershipData }),
      ).rejects.toThrow(/unresolved org/);
      expect(prisma.tenantMembership.updateMany).not.toHaveBeenCalled();
    });

    it('updates the role when both tenant and user resolve', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't_1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u_1' });
      prisma.role.findFirst.mockResolvedValue({ id: 'role_admin' });

      await service.handle({ type: 'organizationMembership.updated', data: membershipData });

      expect(prisma.tenantMembership.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 't_1', userId: 'u_1' },
        data: { roleId: 'role_admin' },
      });
    });

    it('prefers the public_metadata.appRole hint — this is what MembersService.updateRole relies on to resolve Operator vs Viewer', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't_1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u_1' });
      prisma.role.findFirst.mockResolvedValue({ id: 'role_viewer' });

      await service.handle({
        type: 'organizationMembership.updated',
        data: { ...membershipData, role: 'org:member', public_metadata: { appRole: 'Viewer' } },
      });

      expect(prisma.role.findFirst).toHaveBeenCalledWith({ where: { tenantId: null, name: 'Viewer' } });
    });
  });

  it('marks a membership REMOVED on organizationMembership.deleted', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 't_1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u_1' });

    await service.handle({
      type: 'organizationMembership.deleted',
      data: {
        organization: { id: 'org_1' },
        public_user_data: { user_id: 'user_1' },
        role: 'org:member',
      },
    });

    expect(prisma.tenantMembership.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't_1', userId: 'u_1' },
      data: { status: 'REMOVED' },
    });
  });

  it('ignores unhandled event types without throwing', async () => {
    await expect(
      service.handle({ type: 'session.created', data: {} }),
    ).resolves.toBeUndefined();
  });
});
