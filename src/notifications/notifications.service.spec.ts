import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; count: jest.Mock; createMany: jest.Mock };
    tenantMembership: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
      },
      tenantMembership: { findMany: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  it('list scopes to both tenantId and userId', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);

    await service.list('t_1', 'u_1');

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't_1', userId: 'u_1' } }),
    );
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { tenantId: 't_1', userId: 'u_1', readAt: null },
    });
  });

  it('markRead 404s when the notification does not belong to this tenant/user', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.markRead('t_1', 'u_1', 'n_1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('markRead sets readAt when found', async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: 'n_1' });
    prisma.notification.update.mockResolvedValue({ id: 'n_1', readAt: new Date() });

    await service.markRead('t_1', 'u_1', 'n_1');

    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n_1' } }),
    );
  });

  it('notifyTenant fans out to every active membership', async () => {
    prisma.tenantMembership.findMany.mockResolvedValue([{ userId: 'u_1' }, { userId: 'u_2' }]);

    await service.notifyTenant('t_1', { type: 'workflow_failed', title: 'Workflow run failed' });

    expect(prisma.tenantMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't_1', status: 'ACTIVE' } }),
    );
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { tenantId: 't_1', userId: 'u_1', type: 'workflow_failed', title: 'Workflow run failed', body: undefined, payload: undefined },
        { tenantId: 't_1', userId: 'u_2', type: 'workflow_failed', title: 'Workflow run failed', body: undefined, payload: undefined },
      ],
    });
  });

  it('notifyTenant is a no-op when there are no active members', async () => {
    prisma.tenantMembership.findMany.mockResolvedValue([]);

    await service.notifyTenant('t_1', { type: 'workflow_failed', title: 'Workflow run failed' });

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
