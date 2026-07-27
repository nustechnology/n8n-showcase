import { Injectable } from '@nestjs/common';

import { Order, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { ShopifyOrderPayload } from './shopify-order-payload.types';

@Injectable()
export class ShopifyWebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async handleOrderCreated(
    integration: { id: string; tenantId: string },
    payload: ShopifyOrderPayload,
  ): Promise<Order> {
    const shopifyOrderId = String(payload.id);
    const customerEmail = payload.email ?? payload.customer?.email ?? null;
    const customerName = payload.customer
      ? [payload.customer.first_name, payload.customer.last_name].filter(Boolean).join(' ') || null
      : null;

    const order = await this.prisma.order.upsert({
      where: {
        tenantId_shopifyOrderId: { tenantId: integration.tenantId, shopifyOrderId },
      },
      create: {
        tenantId: integration.tenantId,
        shopifyOrderId,
        status: 'RECEIVED',
        customerEmail,
        customerName,
        currency: payload.currency ?? null,
        totalAmount: payload.total_price ?? null,
        rawPayload: payload as unknown as Prisma.InputJsonValue,
      },
      update: {
        rawPayload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId: order.id,
        tenantId: integration.tenantId,
        eventType: 'order_received',
        actor: 'shopify',
        payload: { shopifyOrderId } as Prisma.InputJsonValue,
      },
    });

    return order;
  }
}
