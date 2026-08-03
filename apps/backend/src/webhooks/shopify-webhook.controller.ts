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

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { Public } from '../common/decorators/public.decorator';

import { verifyShopifyWebhookHmac } from '../integrations/adapters/shopify-hmac.util';

import { N8nOrchestratorService } from '../internal/n8n-orchestrator.service';

import { RealtimeService } from '../realtime/realtime.service';

import { ShopifyCheckoutPayload, ShopifyOrderPayload } from './shopify-order-payload.types';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { claimWebhookInboundEvent } from './webhook-inbox-claim.util';

// Path-scoped by Integration.id, not a single static URL with tenant
// resolved from a header — HMAC verification alone can't identify which
// tenant this is (the signing secret is shared across the whole app, not
// per-shop), so something has to disambiguate. A primary-key path lookup
// is an indexed, unambiguous read; matching X-Shopify-Shop-Domain against
// every tenant's Integration.config would be an unindexed JSON scan on
// every single order webhook, not just a one-time OAuth callback.
@Public()
@Controller('webhooks/shopify')
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);
  // `get`, not `getOrThrow` — same reasoning as ShopifyAdapter/
  // IntegrationsService: a platform-level integration credential a
  // deployment can legitimately not have configured yet, not app-wide infra.
  // In practice no Shopify integration can ever reach ACTIVE without this
  // set (the OAuth connect flow itself is gated on it), so this route
  // shouldn't be reachable in that state — but a missing value fails the
  // HMAC check below cleanly rather than crashing boot.
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

  @Post(':integrationId')
  async handle(
    @Param('integrationId') integrationId: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
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

    const payload = JSON.parse(req.rawBody.toString('utf8')) as ShopifyOrderPayload | ShopifyCheckoutPayload;
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });

    const claimed = await claimWebhookInboundEvent(this.prisma, {
      tenantId: integration?.tenantId,
      source: 'SHOPIFY',
      externalId: webhookIdHeader,
      payload: payload as unknown as Prisma.InputJsonValue,
      headers: { shop: shopHeader, webhookId: webhookIdHeader } as Prisma.InputJsonValue,
    });
    if (!claimed) {
      return { received: true };
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
      return { received: true };
    }

    const isCheckoutPayload = (p: ShopifyOrderPayload | ShopifyCheckoutPayload): p is ShopifyCheckoutPayload =>
      'token' in p && !('name' in p);

    try {
      await this.processPayload(integration, payload, webhookIdHeader, isCheckoutPayload(payload));
    } catch (error) {
      this.logger.error(
        `Failed to process Shopify webhook for integration ${integrationId}`,
        error as Error,
      );
      await this.prisma.webhookInboundEvent.update({
        where: { source_externalId: { source: 'SHOPIFY', externalId: webhookIdHeader } },
        data: { status: 'FAILED' },
      });
      throw new ServiceUnavailableException('Failed to process Shopify webhook');
    }

    return { received: true };
  }

  private async processPayload(
    integration: NonNullable<Awaited<ReturnType<PrismaService['integration']['findUnique']>>>,
    payload: ShopifyOrderPayload | ShopifyCheckoutPayload,
    webhookIdHeader: string,
    isCheckout: boolean,
  ): Promise<void> {
    if (isCheckout) {
      const checkout = payload as ShopifyCheckoutPayload;
      const items = (checkout.line_items ?? []).map((item) => ({
        name: item.title ?? 'Unknown item',
        quantity: item.quantity,
      }));

      await this.n8nOrchestrator.startCartReminderRun({
        tenantId: integration.tenantId,
        checkoutToken: checkout.token,
        customerEmail: checkout.email ?? checkout.customer?.email ?? null,
        customerName: checkout.customer
          ? [checkout.customer.first_name, checkout.customer.last_name].filter(Boolean).join(' ') || null
          : null,
        items,
        correlationId: randomUUID(),
      });
    } else {
      const orderPayload = payload as ShopifyOrderPayload;
      const order = await this.shopifyWebhooks.handleOrderCreated(integration, orderPayload);
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
    }

    await this.prisma.webhookInboundEvent.update({
      where: { source_externalId: { source: 'SHOPIFY', externalId: webhookIdHeader } },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
  }
}
