import {
  BadRequestException,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Request } from 'express';
import { Webhook } from 'svix';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { Public } from '../common/decorators/public.decorator';

import { ClerkWebhookEvent } from './clerk-webhook-event.types';
import { ClerkWebhookService } from './clerk-webhook.service';
import { claimWebhookInboundEvent } from './webhook-inbox-claim.util';

@Public()
@Controller('webhooks/clerk')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);
  private readonly secret: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly clerkWebhooks: ClerkWebhookService,
  ) {
    this.secret = config.getOrThrow<string>('CLERK_WEBHOOK_SECRET');
  }

  @Post()
  async handle(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    if (!req.rawBody) {
      throw new BadRequestException('Missing request body');
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (
      typeof svixId !== 'string' ||
      typeof svixTimestamp !== 'string' ||
      typeof svixSignature !== 'string'
    ) {
      throw new BadRequestException('Missing Svix signature headers');
    }

    let event: ClerkWebhookEvent;
    try {
      event = new Webhook(this.secret).verify(req.rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkWebhookEvent;
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Claims the (source, externalId) row atomically before any business
    // logic runs — closes the race where two concurrent deliveries of the
    // same svix-id both pass a check-then-act gap and both process the
    // event. Svix redelivers on a non-2xx response, and can occasionally
    // redeliver an already-succeeded event too. A prior FAILED row is the
    // one exception that must NOT be deduped away: a manual "Resend" from
    // Clerk's dashboard reuses the same svix-id, and that resend is
    // exactly how a failed webhook gets recovered — so claiming it back
    // atomically (guarded by `status: 'FAILED'`) has to be allowed, not
    // silently swallowed forever because a row already exists.
    const claimed = await claimWebhookInboundEvent(this.prisma, {
      source: 'CLERK',
      externalId: svixId,
      payload: event as unknown as Prisma.InputJsonValue,
      headers: { 'svix-id': svixId, 'svix-timestamp': svixTimestamp } as Prisma.InputJsonValue,
    });
    if (!claimed) {
      return { received: true };
    }

    try {
      await this.clerkWebhooks.handle(event);
      await this.prisma.webhookInboundEvent.update({
        where: { source_externalId: { source: 'CLERK', externalId: svixId } },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Failed to process Clerk webhook "${event.type}"`, error as Error);
      await this.prisma.webhookInboundEvent.update({
        where: { source_externalId: { source: 'CLERK', externalId: svixId } },
        data: { status: 'FAILED' },
      });
      throw new InternalServerErrorException('Failed to process webhook — Svix will retry');
    }

    return { received: true };
  }
}
