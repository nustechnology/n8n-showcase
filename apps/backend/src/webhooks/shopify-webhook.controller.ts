import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Controller,
  Logger,
  Param,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Request } from 'express';

import { Integration, Prisma, WebhookSource } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { Public } from '../common/decorators/public.decorator';

import { verifyShopifyWebhookHmac } from '../integrations/adapters/shopify-hmac.util';

import { N8nOrchestratorService } from '../internal/n8n-orchestrator.service';

import { RealtimeService } from '../realtime/realtime.service';

import { ShopifyCartPayload, ShopifyOrderPayload } from './shopify-order-payload.types';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { claimWebhookInboundEvent } from './webhook-inbox-claim.util';

@Public()
@Controller('webhooks/shopify')
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);
  private readonly clientSecret: string | undefined;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly shopifyWebhooks: ShopifyWebhookService,
    private readonly n8nOrchestrator: N8nOrchestratorService,
    private readonly realtime: RealtimeService,
  ) {
    this.clientSecret = config.get<string>('SHOPIFY_CLIENT_SECRET');
  }

  // Shared HMAC verification + integration lookup + webhook dedup claim.
  // Returns the integration if everything checks out, or null after
  // recording a rejection (caller should return { received: true }).
  private async verifyAndResolve(
    integrationId: string,
    req: RawBodyRequest<Request>,
  ): Promise<{ integration: Integration; webhookIdHeader: string; payload: unknown } | null> {
    if (!req.rawBody) {
      throw new BadRequestException('Missing request body');
    }

    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    const shopHeader = req.headers['x-shopify-shop-domain'];
    const webhookIdHeader = req.headers['x-shopify-webhook-id'];
    if (
      typeof hmacHeader !== 'string' ||
      typeof shopHeader !== 'string' ||
      typeof webhookIdHeader !== 'string'
    ) {
      throw new BadRequestException('Missing Shopify webhook headers');
    }

    if (!this.clientSecret || !verifyShopifyWebhookHmac(req.rawBody, hmacHeader, this.clientSecret)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = JSON.parse(req.rawBody.toString('utf8'));
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });

    const claimed = await claimWebhookInboundEvent(this.prisma, {
      tenantId: integration?.tenantId,
      source: 'SHOPIFY' as WebhookSource,
      externalId: webhookIdHeader,
      payload: payload as Prisma.InputJsonValue,
      headers: { shop: shopHeader, webhookId: webhookIdHeader } as Prisma.InputJsonValue,
    });
    if (!claimed) {
      return null;
    }

    let failureReason: string | null = null;
    if (!integration) {
      failureReason = 'No integration found for this webhook URL';
    } else if (integration.status !== 'ACTIVE') {
      failureReason = `Integration status is ${integration.status}, not ACTIVE`;
    } else if ((integration.config as { shop?: string }).shop !== shopHeader) {
      failureReason = 'X-Shopify-Shop-Domain does not match the connected shop';
    }

    if (failureReason || !integration) {
      this.logger.warn(`Rejected Shopify webhook for integration ${integrationId}: ${failureReason}`);
      await this.prisma.webhookInboundEvent.update({
        where: { source_externalId: { source: 'SHOPIFY', externalId: webhookIdHeader } },
        data: { status: 'FAILED' },
      });
      return null;
    }

    return { integration, webhookIdHeader, payload };
  }

  @Post(':integrationId')
  async handle(
    @Param('integrationId') integrationId: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    const resolved = await this.verifyAndResolve(integrationId, req);
    if (!resolved) {
      return { received: true };
    }

    const { integration, webhookIdHeader } = resolved;
    const payload = resolved.payload as ShopifyOrderPayload;

    try {
      const order = await this.shopifyWebhooks.handleOrderCreated(integration, payload);
      this.realtime.publishOrderUpdate({
        tenantId: integration.tenantId,
        orderId: order.id,
        status: order.status,
        type: 'order_created',
      });
      await this.n8nOrchestrator.startOrderValidationRun({
        tenantId: integration.tenantId,
        orderId: order.id,
        correlationId: randomUUID(),
      });
      await this.prisma.webhookInboundEvent.update({
        where: { source_externalId: { source: 'SHOPIFY', externalId: webhookIdHeader } },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(
        `Failed to process Shopify order webhook for integration ${integrationId}`,
        error as Error,
      );
      await this.prisma.webhookInboundEvent.update({
        where: { source_externalId: { source: 'SHOPIFY', externalId: webhookIdHeader } },
        data: { status: 'FAILED' },
      });
      throw new ServiceUnavailableException('Failed to process Shopify order webhook');
    }

    return { received: true };
  }

  @Post(':integrationId/cart')
  async handleCart(
    @Param('integrationId') integrationId: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    const resolved = await this.verifyAndResolve(integrationId, req);
    if (!resolved) {
      return { received: true };
    }

    const { integration, webhookIdHeader } = resolved;
    const cart = resolved.payload as ShopifyCartPayload;

    const items = (cart.line_items ?? []).map((item) => ({
      name: item.title ?? 'Unknown item',
      quantity: item.quantity,
    }));

    try {
      await this.n8nOrchestrator.startCartReminderRun({
        tenantId: integration.tenantId,
        cartToken: cart.token,
        triggeredAt: new Date().toISOString(),
        customerEmail: null,
        customerName: null,
        items,
        correlationId: randomUUID(),
      });
      await this.prisma.webhookInboundEvent.update({
        where: { source_externalId: { source: 'SHOPIFY', externalId: webhookIdHeader } },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(
        `Failed to process Shopify cart webhook for integration ${integrationId}`,
        error as Error,
      );
      await this.prisma.webhookInboundEvent.update({
        where: { source_externalId: { source: 'SHOPIFY', externalId: webhookIdHeader } },
        data: { status: 'FAILED' },
      });
      throw new ServiceUnavailableException('Failed to process Shopify cart webhook');
    }

    return { received: true };
  }
}
