import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_TAKE = 20;

export interface NotifyTenantInput {
  type: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // take/skip are already bounds-checked by ListNotificationsSchema
  // (src/notifications/dto/) before reaching here — only defaults live here.
  async list(tenantId: string, userId: string, take = DEFAULT_TAKE, skip = 0) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { tenantId, userId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.notification.count({ where: { tenantId, userId, readAt: null } }),
    ]);

    return { items, unreadCount };
  }

  async markRead(tenantId: string, userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, tenantId, userId } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  // Fan-out to every currently-active member of the tenant — there's no
  // more targeted recipient concept in the schema (no per-order watchers),
  // and both trigger sources (workflow failures, integration degradation)
  // are tenant-wide problems, not scoped to one member.
  async notifyTenant(tenantId: string, input: NotifyTenantInput): Promise<void> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { userId: true },
    });
    if (memberships.length === 0) return;

    await this.prisma.notification.createMany({
      data: memberships.map((membership) => ({
        tenantId,
        userId: membership.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      })),
    });
  }
}
