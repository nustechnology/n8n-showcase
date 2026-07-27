import { Module } from '@nestjs/common';

import { InternalModule } from '../internal/internal.module';
import { RealtimeModule } from '../realtime/realtime.module';

import { ClerkWebhookController } from './clerk-webhook.controller';
import { ClerkWebhookService } from './clerk-webhook.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { ShopifyWebhookService } from './shopify-webhook.service';

@Module({
  imports: [InternalModule, RealtimeModule],
  controllers: [ClerkWebhookController, ShopifyWebhookController],
  providers: [ClerkWebhookService, ShopifyWebhookService],
})
export class WebhooksModule {}
