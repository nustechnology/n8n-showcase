import { Test } from '@nestjs/testing';

import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { ClerkBackendService } from '../auth/clerk-backend.service';

import { MembersService } from './members.service';

describe('MembersService', () => {
  let service: MembersService;
  let prisma: {
    tenantMembership: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    tenant: { findUniqueOrThrow: jest.Mock };
    role: { findFirstOrThrow: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let clerkBackend: {
    createInvitation: jest.Mock;
    updateMembershipRole: jest.Mock;
    updateMembershipMetadata: jest.Mock;
    removeMembership: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      tenantMembership: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      tenant: { findUniqueOrThrow: jest.fn() },
      role: { findFirstOrThrow: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    clerkBackend = {
      createInvitation: jest.fn(),
      updateMembershipRole: jest.fn(),
      updateMembershipMetadata: jest.fn(),
      removeMembership: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClerkBackendService, useValue: clerkBackend },
      ],
    }).compile();

    service = moduleRef.get(MembersService);
  });

  describe('listForTenant', () => {
    it('excludes REMOVED memberships and shapes the response', async () => {
      prisma.tenantMembership.findMany.mockResolvedValue([
        {
          id: 'm_1',
          status: 'ACTIVE',
          joinedAt: new Date('2026-01-01'),
          role: { name: 'Admin' },
          user: { id: 'u_1', email: 'a@example.com', name: 'Ada' },
        },
      ]);

      const result = await service.listForTenant('t_1');

      expect(prisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't_1', status: { not: 'REMOVED' } } }),
      );
      expect(result).toEqual([
        {
          membershipId: 'm_1',
          status: 'ACTIVE',
          role: 'Admin',
          joinedAt: new Date('2026-01-01'),
          user: { id: 'u_1', email: 'a@example.com', name: 'Ada' },
        },
      ]);
    });
  });

  describe('invite', () => {
    it('calls Clerk with role + appRole metadata and writes an audit row, without touching TenantMembership', async () => {
      prisma.tenant.findUniqueOrThrow.mockResolvedValue({ clerkOrgId: 'org_1' });

      await service.invite('t_1', 'u_actor', 'clerk_actor', {
        email: 'new@example.com',
        role: 'Viewer',
      });

      expect(clerkBackend.createInvitation).toHaveBeenCalledWith({
        clerkOrgId: 'org_1',
        inviterClerkUserId: 'clerk_actor',
        email: 'new@example.com',
        clerkRole: 'org:member',
        appRole: 'Viewer',
      });
      expect(prisma.tenantMembership.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 't_1',
          userId: 'u_actor',
          action: 'member.invited',
          resourceType: 'TenantMembership',
          resourceId: null,
          metadata: { email: 'new@example.com', role: 'Viewer' },
        },
      });
    });

    it('maps Admin to org:admin', async () => {
      prisma.tenant.findUniqueOrThrow.mockResolvedValue({ clerkOrgId: 'org_1' });

      await service.invite('t_1', 'u_actor', 'clerk_actor', { email: 'x@example.com', role: 'Admin' });

      expect(clerkBackend.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ clerkRole: 'org:admin' }),
      );
    });
  });

  describe('updateRole', () => {
    const membership = {
      id: 'm_1',
      tenantId: 't_1',
      user: { clerkUserId: 'clerk_2' },
      role: { name: 'Operator' },
    };

    it('writes metadata before role, then the local row, then audit', async () => {
      prisma.tenantMembership.findUnique.mockResolvedValue(membership);
      prisma.tenant.findUniqueOrThrow.mockResolvedValue({ clerkOrgId: 'org_1' });
      prisma.role.findFirstOrThrow.mockResolvedValue({ id: 'role_admin' });

      const callOrder: string[] = [];
      clerkBackend.updateMembershipMetadata.mockImplementation(async () => {
        callOrder.push('metadata');
      });
      clerkBackend.updateMembershipRole.mockImplementation(async () => {
        callOrder.push('role');
      });

      await service.updateRole('t_1', 'u_actor', 'm_1', { role: 'Admin' });

      expect(callOrder).toEqual(['metadata', 'role']);
      expect(clerkBackend.updateMembershipMetadata).toHaveBeenCalledWith({
        clerkOrgId: 'org_1',
        clerkUserId: 'clerk_2',
        appRole: 'Admin',
      });
      expect(clerkBackend.updateMembershipRole).toHaveBeenCalledWith({
        clerkOrgId: 'org_1',
        clerkUserId: 'clerk_2',
        clerkRole: 'org:admin',
      });
      expect(prisma.tenantMembership.update).toHaveBeenCalledWith({
        where: { id: 'm_1' },
        data: { roleId: 'role_admin' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'member.role_changed', resourceId: 'm_1' }),
        }),
      );
    });

    it('refuses to change the Owner role', async () => {
      prisma.tenantMembership.findUnique.mockResolvedValue({
        ...membership,
        role: { name: 'Owner' },
      });

      await expect(service.updateRole('t_1', 'u_actor', 'm_1', { role: 'Admin' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(clerkBackend.updateMembershipRole).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the membership belongs to a different tenant', async () => {
      prisma.tenantMembership.findUnique.mockResolvedValue({ ...membership, tenantId: 't_other' });

      await expect(service.updateRole('t_1', 'u_actor', 'm_1', { role: 'Admin' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('removes from Clerk, marks the local row REMOVED, and writes audit', async () => {
      prisma.tenantMembership.findUnique.mockResolvedValue({
        id: 'm_1',
        tenantId: 't_1',
        user: { clerkUserId: 'clerk_2' },
        role: { name: 'Operator' },
      });
      prisma.tenant.findUniqueOrThrow.mockResolvedValue({ clerkOrgId: 'org_1' });

      await service.remove('t_1', 'u_actor', 'm_1');

      expect(clerkBackend.removeMembership).toHaveBeenCalledWith({
        clerkOrgId: 'org_1',
        clerkUserId: 'clerk_2',
      });
      expect(prisma.tenantMembership.update).toHaveBeenCalledWith({
        where: { id: 'm_1' },
        data: { status: 'REMOVED' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'member.removed', resourceId: 'm_1' }),
        }),
      );
    });

    it('refuses to remove the Owner', async () => {
      prisma.tenantMembership.findUnique.mockResolvedValue({
        id: 'm_1',
        tenantId: 't_1',
        user: { clerkUserId: 'clerk_2' },
        role: { name: 'Owner' },
      });

      await expect(service.remove('t_1', 'u_actor', 'm_1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(clerkBackend.removeMembership).not.toHaveBeenCalled();
    });
  });
});
