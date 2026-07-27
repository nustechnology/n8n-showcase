import { Module } from '@nestjs/common';

import { CredentialsModule } from '../credentials/credentials.module';

import { NotificationsModule } from '../notifications/notifications.module';

import { DiscordAdapter } from './adapters/discord.adapter';
import { EasyPostAdapter } from './adapters/easypost.adapter';
import { OdooAdapter } from './adapters/odoo.adapter';
import { ShippoAdapter } from './adapters/shippo.adapter';
import { MailgunAdapter } from './adapters/mailgun.adapter';
import { ResendAdapter } from './adapters/resend.adapter';
import { SendGridAdapter } from './adapters/sendgrid.adapter';
import { ShopifyAdapter } from './adapters/shopify.adapter';
import { SlackAdapter } from './adapters/slack.adapter';
import { ZohoInventoryAdapter } from './adapters/zoho-inventory.adapter';
import { IntegrationAdapterRegistry } from './integration-adapter.registry';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [CredentialsModule, NotificationsModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    IntegrationAdapterRegistry,
    ShopifyAdapter,
    ResendAdapter,
    SendGridAdapter,
    MailgunAdapter,
    ZohoInventoryAdapter,
    OdooAdapter,
    EasyPostAdapter,
    ShippoAdapter,
    SlackAdapter,
    DiscordAdapter,
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
