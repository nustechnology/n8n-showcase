import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RealtimeService } from '../realtime/realtime.service';

import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; count: jest.Mock };
    orderEvent: { findMany: jest.Mock; create: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let realtime: { publishOrderUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      order: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
      orderEvent: { findMany: jest.fn(), create: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    realtime = { publishOrderUpdate: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  it('findAll scopes to the tenant', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(0);
    await service.findAll('t_1', {});
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't_1' } }),
    );
  });

  it('findAll defaults to 10 per page and returns the total count', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(23);

    const result = await service.findAll('t_1', {});

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10, skip: 0 }));
    expect(result).toEqual({ items: [], total: 23 });
  });

  it('findAll filters by status and search when provided', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(0);

    await service.findAll('t_1', { take: 10, skip: 10, status: 'FAILED', search: 'jane' });

    const expectedWhere = {
      tenantId: 't_1',
      status: 'FAILED',
      OR: [
        { shopifyOrderId: { contains: 'jane', mode: 'insensitive' } },
        { customerName: { contains: 'jane', mode: 'insensitive' } },
        { customerEmail: { contains: 'jane', mode: 'insensitive' } },
      ],
    };
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere, take: 10, skip: 10 }),
    );
    expect(prisma.order.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('findOne 404s when the order does not belong to this tenant', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(service.findOne('t_1', 'o_1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('timeline 404s before ever querying OrderEvent if the order is not this tenant\'s', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(service.timeline('t_1', 'o_1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.orderEvent.findMany).not.toHaveBeenCalled();
  });

  it('timeline returns events scoped to both the order and the tenant', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
    prisma.orderEvent.findMany.mockResolvedValue([]);

    await service.timeline('t_1', 'o_1');

    expect(prisma.orderEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'o_1', tenantId: 't_1' } }),
    );
  });

  it('overrideStatus 404s when the order does not belong to this tenant', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(
      service.overrideStatus('t_1', 'o_1', 'u_1', { status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('overrideStatus writes the order update, OrderEvent, and AuditLog atomically', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o_1', tenantId: 't_1', status: 'FULFILLED' });
    const orderUpdateCall = Symbol('order.update');
    const orderEventCreateCall = Symbol('orderEvent.create');
    const auditLogCreateCall = Symbol('auditLog.create');
    prisma.order.update.mockReturnValue(orderUpdateCall);
    prisma.orderEvent.create.mockReturnValue(orderEventCreateCall);
    prisma.auditLog.create.mockReturnValue(auditLogCreateCall);
    prisma.$transaction.mockResolvedValue([{ id: 'o_1', status: 'COMPLETED' }]);

    const result = await service.overrideStatus('t_1', 'o_1', 'u_1', {
      status: 'COMPLETED',
      reason: 'customer confirmed receipt',
    });

    const metadata = { from: 'FULFILLED', to: 'COMPLETED', reason: 'customer confirmed receipt' };
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o_1' }, data: { status: 'COMPLETED' } });
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'o_1',
          tenantId: 't_1',
          eventType: 'manual_override',
          actor: 'u_1',
          payload: metadata,
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't_1',
          userId: 'u_1',
          action: 'order.status_override',
          resourceType: 'Order',
          resourceId: 'o_1',
          metadata,
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith([orderUpdateCall, orderEventCreateCall, auditLogCreateCall]);
    expect(result).toEqual({ id: 'o_1', status: 'COMPLETED' });
  });

  it('overrideStatus publishes a realtime order update', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o_1', tenantId: 't_1', status: 'FULFILLED' });
    prisma.$transaction.mockResolvedValue([{ id: 'o_1', status: 'COMPLETED' }]);

    await service.overrideStatus('t_1', 'o_1', 'u_1', { status: 'COMPLETED' });

    expect(realtime.publishOrderUpdate).toHaveBeenCalledWith({
      tenantId: 't_1',
      orderId: 'o_1',
      status: 'COMPLETED',
      type: 'order_status_changed',
    });
  });
});
