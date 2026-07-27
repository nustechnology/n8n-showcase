import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// Mocked pending a paid OpenAI key — a real model call would go here (fetch
// the order, ask OpenAI, return its verdict) but the account isn't billed
// yet, so this stands in with a plain sanity check so the workflow isn't
// blocked. The endpoint's contract with n8n (`{ valid, notes? }`) is what
// matters and won't change when the real call is wired in.
@Injectable()
export class AiValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validateOrder(tenantId: string, orderId: string): Promise<{ valid: boolean; notes?: string }> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) {
      throw new NotFoundException('Order not found for this tenant');
    }

    const valid = Boolean(order.customerEmail) && Number(order.totalAmount) > 0;

    return {
      valid,
      notes: valid
        ? 'mocked validation — OpenAI not wired in yet'
        : 'mocked validation — missing customer email or non-positive total',
    };
  }
}
