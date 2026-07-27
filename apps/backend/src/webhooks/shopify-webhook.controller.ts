import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Controller,
  Logger,
  Param,
  Post,
  RawBodyRequest,
  Req,
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

    // Dedupe before touching Integration lookups — Shopify redelivers on
    // any non-2xx response. A prior FAILED row is the one exception that
    // must NOT be deduped away — same reasoning as ClerkWebhookController:
    // a row already existing shouldn't permanently block a legitimate
    // reprocessing attempt for an event that never actually succeeded.
    const existing = await this.prisma.webhookInboundEvent.findUnique({
      where: { source_externalId: { source: 'SHOPIFY', externalId: webhookIdHeader } },
    });
    if (existing && existing.status !== 'FAILED') {
      return { received: true };
    }

    const payload = JSON.parse(req.rawBody.toString('utf8')) as ShopifyOrderPayload;
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });

    // A miss, a not-ACTIVE integration, or a shop header that doesn't
    // match what's on file are all handled the same way: ack 200, record
    // FAILED, never 500 — Shopify retries a non-2xx indefinitely, and any
    // of these can legitimately happen (e.g. a disconnected integration's
    // Shopify-side subscription isn't always cleaned up in time).
    let failureReason: string | null = null;
    if (!integration) {
      failureReason = 'No integration found for this webhook URL';
    } else if (integration.status !== 'ACTIVE') {
      failureReason = `Integration status is ${integration.status}, not ACTIVE`;
    } else if ((integration.config as { shop?: string }).shop !== shopHeader) {
      failureReason = 'X-Shopify-Shop-Domain does not match the connected shop';
    }

    await this.prisma.webhookInboundEvent.upsert({
      where: { source_externalId: { source: 'SHOPIFY', externalId: webhookIdHeader } },
      create: {
        tenantId: integration?.tenantId,
        source: 'SHOPIFY',
        externalId: webhookIdHeader,
        payload: payload as unknown as Prisma.InputJsonValue,
        headers: { shop: shopHeader, webhookId: webhookIdHeader } as Prisma.InputJsonValue,
        signatureValid: true,
        status: failureReason ? 'FAILED' : 'PROCESSING',
      },
      update: {
        tenantId: integration?.tenantId,
        payload: payload as unknown as Prisma.InputJsonValue,
        headers: { shop: shopHeader, webhookId: webhookIdHeader } as Prisma.InputJsonValue,
        status: failureReason ? 'FAILED' : 'PROCESSING',
        processedAt: null,
      },
    });

    if (failureReason || !integration) {
      this.logger.warn(`Rejected Shopify webhook for integration ${integrationId}: ${failureReason}`);
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
    }

    return { received: true };
  }
}
