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

import { ShopifyOrderPayload } from './shopify-order-payload.types';
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

    const payload = JSON.parse(req.rawBody.toString('utf8')) as ShopifyOrderPayload;
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });

    // Claims the (source, externalId) row atomically before any business
    // logic runs — closes the race where two concurrent deliveries of the
    // same webhookId both pass a check-then-act gap and both process the
    // order. If we lose the claim, either another request already handled
    // (or is handling) this exact event, or it's already PROCESSED/
    // PROCESSING and not eligible for a FAILED-only retry — either way,
    // nothing to do here.
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

    // A miss, a not-ACTIVE integration, or a shop header that doesn't
    // match what's on file are all handled the same way: ack 200, record
    // FAILED, never 500 — Shopify retries a non-2xx indefinitely, and any
    // of these can legitimately happen (e.g. a disconnected integration's
    // Shopify-side subscription isn't always cleaned up in time). These
    // are permanent until the tenant fixes their config, so unlike the
    // processing failure below, a retry genuinely wouldn't help — 200
    // stays correct here.
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

    try {
      const order = await this.shopifyWebhooks.handleOrderCreated(integration, payload);
      this.realtime.publishOrderUpdate({
        tenantId: integration.tenantId,
        orderId: order.id,
        status: order.status,
        type: 'order_created',
      });
      // Kicks off n8n's order-validation workflow — a failure here (n8n
      // unreachable, etc.) is deliberately treated the same as a failure to
      // write the order itself: the row below still lands as FAILED, not a
      // silently-swallowed 200, since the order would otherwise sit at
      // RECEIVED forever with nothing to surface that.
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
      // Unlike the rejection branches above, this failure (DB/n8n
      // unreachable, etc.) is genuinely transient — a 503 lets Shopify's
      // own automatic redelivery retry it, instead of requiring a manual
      // resend from the Shopify dashboard for something that might just
      // clear up on its own.
      throw new ServiceUnavailableException('Failed to process Shopify order webhook');
    }

    return { received: true };
  }
}
