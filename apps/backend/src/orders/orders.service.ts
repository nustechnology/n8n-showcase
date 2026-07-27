import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { RealtimeService } from '../realtime/realtime.service';

import { UpdateOrderStatusInput } from './dto/update-order-status.schema';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  findAll(tenantId: string) {
    return this.prisma.order.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, tenantId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async timeline(tenantId: string, id: string) {
    await this.findOne(tenantId, id); // 404s if the order doesn't belong to this tenant
    return this.prisma.orderEvent.findMany({
      where: { orderId: id, tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // A human overriding the automated pipeline — the one place that happens,
  // so it gets both an OrderEvent (timeline) and an AuditLog entry, written
  // atomically with the status change itself.
  async overrideStatus(tenantId: string, id: string, userId: string, input: UpdateOrderStatusInput) {
    const order = await this.findOne(tenantId, id);
    const metadata = { from: order.status, to: input.status, reason: input.reason ?? null };

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({ where: { id }, data: { status: input.status } }),
      this.prisma.orderEvent.create({
        data: {
          orderId: id,
          tenantId,
          eventType: 'manual_override',
          actor: userId,
          payload: metadata as Prisma.InputJsonValue,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'order.status_override',
          resourceType: 'Order',
          resourceId: id,
          metadata: metadata as Prisma.InputJsonValue,
        },
      }),
    ]);

    this.realtime.publishOrderUpdate({
      tenantId,
      orderId: id,
      status: input.status,
      type: 'order_status_changed',
    });

    return updated;
  }
}
