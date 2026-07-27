import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: { auditLog: { findMany: jest.Mock; count: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      auditLog: { findMany: jest.fn(), count: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AuditLogService);
  });

  it('list scopes to tenantId, orders newest first, and includes the actor', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.list('t_1');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't_1' },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: { tenantId: 't_1' } });
  });

  it('defaults take/skip when not provided', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.list('t_1');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 0 }));
  });

  it('passes take/skip through when provided', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.list('t_1', 5, 10);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, skip: 10 }));
  });

  it('returns items and total together', async () => {
    const items = [{ id: 'a_1' }, { id: 'a_2' }];
    prisma.auditLog.findMany.mockResolvedValue(items);
    prisma.auditLog.count.mockResolvedValue(2);

    const result = await service.list('t_1');

    expect(result).toEqual({ items, total: 2 });
  });
});
